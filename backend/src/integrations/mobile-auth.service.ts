import { BadGatewayException, BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '../common/constants/roles.enum';
import { PrismaCompaniesRepository, CompanyForMobileLogin } from '../companies/repositories/prisma-companies.repository';
import { PrismaSessionsRepository } from '../auth/repositories/prisma-sessions.repository';
import { generateSessionId } from '../auth/utils/token.util';
import { SettingsService } from '../settings/settings.service';
import { SystemLogsService } from '../system-logs/system-logs.service';
import { IntegrationsService } from './integrations.service';
import { PrismaEndpointsRepository } from './repositories/prisma-endpoints.repository';
import { PrismaFieldMappingsRepository } from './repositories/prisma-field-mappings.repository';
import { FieldMappingService } from './services/field-mapping.service';
import { IntegrationEndpointExecutorService } from './services/integration-endpoint-executor.service';
import { EMPLOYEE_LOGIN_ENDPOINT_NAME } from './constants/reserved-endpoint-names.constant';
import { MobileLoginDto } from './dto/mobile-login.dto';
import { LoginSessionService } from './login-session.service';
import { MobileLoginResult } from './interfaces/mobile-login-result.interface';
import { MobileRefreshResult } from './interfaces/mobile-refresh-result.interface';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { HR_EMPLOYEE_ID_MAX_LENGTH, buildStatelessUserKey } from './utils/stateless-session.util';

/** AttendHub's own request-side fields on the EMPLOYEE_LOGIN purpose — see endpoint-purposes.constant.ts. */
const REQUEST_FIELDS = ['username', 'password'];
/** AttendHub's own response-side field on the EMPLOYEE_LOGIN purpose — the identity key Employee Sync already uses. */
const RESPONSE_EXTERNAL_ID_FIELD = 'externalId';
/** Response-side fields read from the HR login: the employee id (required) and name (optional). */
const RESPONSE_FIELDS = [RESPONSE_EXTERNAL_ID_FIELD, 'name', 'userId'];

/**
 * Mobile app authentication — completely separate from AuthService/
 * AuthController's web admin login. Employees have no password in
 * AttendHub's own database (usm_users.c_password holds only a throwaway
 * dummy value — see PrismaEmployeesRepository.create()'s doc comment):
 * credentials are verified by forwarding them to the company's connected HR
 * system, through the exact same Endpoint/FieldMapping/Executor machinery
 * every other integration call in this module already uses.
 *
 * Lives in IntegrationsModule, not AuthModule, for the same reason
 * AttendancePunchService/EmployeeSyncService do: it needs
 * IntegrationsModule's own local providers (endpoints/field-mappings/
 * executor) plus EmployeesModule (already imported here), and AuthModule
 * cannot import IntegrationsModule back without creating a cycle (this
 * module already imports AuthModule). Session issuance is done directly
 * against the same two exported building blocks AuthService itself uses
 * (JwtService via JwtModule, PrismaSessionsRepository) rather than adding a
 * new export to AuthModule's surface for one caller.
 *
 * Flow: resolve the company by shortname (no session exists yet — see
 * MobileLoginDto) -> find its connected integration -> find the
 * "EMPLOYEE_LOGIN" endpoint -> forward username/password to it, mapped to
 * whatever field names the real HR API expects -> map the HR response back
 * to "externalId" -> resolve that to an already-linked AttendHub employee
 * (see EmployeesService.findByExternalIdentity(), the same identity key
 * Employee Sync populates) -> issue a session for them. An employee whose
 * HR credentials check out but who isn't linked in AttendHub yet is
 * rejected with a clear message — Employee Sync (manual or the 30-minute
 * background pass) must run first.
 */
@Injectable()
export class MobileAuthService {
  constructor(
    private readonly companiesRepository: PrismaCompaniesRepository,
    private readonly integrationsService: IntegrationsService,
    private readonly endpointsRepository: PrismaEndpointsRepository,
    private readonly fieldMappingsRepository: PrismaFieldMappingsRepository,
    private readonly fieldMappingEngine: FieldMappingService,
    private readonly executor: IntegrationEndpointExecutorService,
    private readonly sessionsRepository: PrismaSessionsRepository,
    private readonly settingsService: SettingsService,
    private readonly jwtService: JwtService,
    private readonly systemLogsService: SystemLogsService,
    private readonly loginSessionService: LoginSessionService,
  ) {}

  async login(dto: MobileLoginDto): Promise<MobileLoginResult> {
    const company = await this.companiesRepository.findForMobileLoginByShortname(dto.companyShortName);
    // Same generic message whichever of company/username/password was
    // wrong — a login endpoint must never leak which part failed.
    if (!company) {
      throw new UnauthorizedException('Invalid company, username, or password.');
    }
    if (company.status !== 'ACTIVE') {
      throw new ForbiddenException('This company account is not currently active.');
    }

    const integration = await this.integrationsService.findMineForCompany(company.id);
    if (!integration || integration.status !== 'CONNECTED') {
      throw new BadRequestException('Mobile login is not set up (or is currently disabled) for your company.');
    }

    const endpoint = await this.endpointsRepository.findByIntegrationAndName(company.id, integration.id, EMPLOYEE_LOGIN_ENDPOINT_NAME);
    if (!endpoint) {
      throw new BadRequestException('Your company has not configured an "Employee Login" endpoint yet.');
    }

    const mappings = await this.fieldMappingsRepository.findActiveByEndpoint(company.id, integration.id, endpoint.id);
    const domainMappings = mappings.map((mapping) => this.fieldMappingEngine.toDomainMapping(mapping));
    const requestMappings = domainMappings.filter((mapping) => REQUEST_FIELDS.includes(mapping.sourcePath));
    const responseMappings = domainMappings.filter((mapping) => RESPONSE_FIELDS.includes(mapping.targetField));
    const hasExternalIdMapping = responseMappings.some((mapping) => mapping.targetField === RESPONSE_EXTERNAL_ID_FIELD);

    // A GET login carries its credentials in the URL path placeholders, so it needs no request-side mapping.
    if ((endpoint.httpMethod !== 'GET' && requestMappings.length === 0) || !hasExternalIdMapping) {
      throw new BadRequestException(
        'Your company\'s "Employee Login" endpoint is not fully mapped yet — it needs at least one mapping ' +
          'sending "username" or "password", and one mapping reading "externalId" back from the response.',
      );
    }

    const requestBody = this.fieldMappingEngine.apply({ username: dto.username, password: dto.password }, requestMappings);
    // The same values also fill {{shortname}}/{{username}}/{{password}} in the endpoint path (URL-encoded by the
    // executor) for HR APIs that take credentials in the URL; a no-op when the configured path has none of them.
    const result = await this.executor.execute(
      company.id,
      integration.id,
      endpoint.id,
      { shortname: dto.companyShortName, username: dto.username, password: dto.password },
      requestBody,
    );

    if (!result.success) {
      this.systemLogsService.record({
        user: 'mobile-login',
        action: 'MOBILE_LOGIN_FAILED',
        resource: 'Auth',
        severity: 'WARNING',
        description: `Mobile login failed for company "${dto.companyShortName}": ${result.error ?? `HTTP ${result.statusCode}`}.`,
        metadata: { companyId: company.id, integrationId: integration.id, statusCode: result.statusCode },
      });
      throw new UnauthorizedException('Invalid company, username, or password.');
    }

    const mapped = this.fieldMappingEngine.applyToResponse(result.body, responseMappings);

    // Some HR login APIs answer "wrong credentials" with an empty/no-data 2xx instead of an error status.
    if (this.isEmptyLoginResult(result.body, mapped)) {
      this.systemLogsService.record({
        user: 'mobile-login',
        action: 'MOBILE_LOGIN_FAILED',
        resource: 'Auth',
        severity: 'WARNING',
        description: `Mobile login failed for company "${dto.companyShortName}": the HR system returned no data.`,
        metadata: { companyId: company.id, integrationId: integration.id, statusCode: result.statusCode },
      });
      throw new UnauthorizedException('Invalid company, username, or password.');
    }
    const mappedRecord = (Array.isArray(mapped) ? mapped[0] : mapped) as Record<string, unknown> | undefined;
    const externalId = typeof mappedRecord?.externalId === 'string' ? mappedRecord.externalId.trim() : '';

    if (!externalId) {
      throw new BadGatewayException(
        'The HR system did not return a usable employee id — check the "Employee Login" endpoint\'s response field mapping.',
      );
    }

    if (externalId.length > HR_EMPLOYEE_ID_MAX_LENGTH) {
      throw new BadGatewayException('The HR system returned an employee id that is too long to use.');
    }
    const hrName = typeof mappedRecord?.name === 'string' ? mappedRecord.name.trim() : '';

    // Stateless: AttendHub stores no employee. The HR system has just verified
    // this person; the session carries only the company and the HR's own id.
    const loginResult = await this.issueSession(company, externalId, hrName);

    // The HR system has verified this person: record this login as a session with HR (its login_sessions API) on
    // EVERY login. Best-effort: a missing "Login Session" endpoint or an HR failure never blocks the login.
    const hrUserId = typeof mappedRecord?.userId === 'string' || typeof mappedRecord?.userId === 'number' ? String(mappedRecord.userId) : undefined;
    try {
      await this.loginSessionService.register(company.id, externalId, {
        userId: hrUserId,
        deviceId: dto.deviceId,
        deviceName: dto.deviceName,
        appVersion: dto.appVersion,
        ipAddress: dto.ipAddress,
        ...this.sessionTokenFacts(loginResult.token),
      });
    } catch {
      // Already audited by LoginSessionService (outcome only); the employee is still logged in.
    }

    return loginResult;
  }

  /**
   * Ends the caller's own mobile session: the token is revoked in the database, so it stops working immediately
   * (idempotent — revoking an already-revoked token is a no-op). Only the token itself is touched; nothing on the
   * HR side is changed.
   */
  async logout(token: string): Promise<void> {
    await this.sessionsRepository.revoke(token);
    this.systemLogsService.record({
      user: 'mobile-user',
      action: 'MOBILE_LOGOUT',
      resource: 'Auth',
      description: 'An employee logged out from the mobile app.',
    });
  }

  /**
   * Sliding session: swaps a still-valid token for a brand-new one with a fresh lifetime and revokes the old one.
   * The caller must already be authenticated (AuthGuard has validated `currentToken` and filled `user`), so an
   * expired or revoked token can NOT be refreshed — the app has to call this BEFORE the token expires and fall back
   * to a normal login otherwise. Identity (company, HR employee id, display name) is carried over unchanged; HR is
   * not contacted, so a refresh never re-checks the password.
   */
  async refresh(currentToken: string, user: AuthenticatedUser): Promise<MobileRefreshResult> {
    if (!user.companyId || !user.employeeId) {
      throw new ForbiddenException('This session has no employee profile.');
    }
    const ttlSeconds = await this.settingsService.getSessionTimeoutSeconds();
    const token = await this.jwtService.signAsync(
      { sub: user.userId, role: Role.EMPLOYEE, companyId: user.companyId, employeeId: user.employeeId, jti: generateSessionId() },
      { expiresIn: `${ttlSeconds}s` },
    );
    // Create the new session first, revoke the old one second: if the second step fails the employee simply has two
    // valid tokens until the old one expires, never zero.
    await this.sessionsRepository.create(
      { token, userId: user.userId, role: Role.EMPLOYEE, companyId: user.companyId, employeeId: user.employeeId },
      ttlSeconds,
    );
    await this.sessionsRepository.revoke(currentToken);
    this.systemLogsService.record({
      user: 'mobile-user',
      action: 'MOBILE_TOKEN_REFRESH',
      resource: 'Auth',
      description: 'A mobile app session token was refreshed.',
      metadata: { companyId: user.companyId },
    });
    return { token, expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString() };
  }

  /** The hub's own session token and its expiry, for HR's login_sessions record (sent only if the admin mapped them; the hub has no refresh token). */
  private sessionTokenFacts(token: string): { accessToken: string; accessTokenExpiry?: string } {
    let decoded: { exp?: number } | null = null;
    try {
      decoded = this.jwtService.decode(token) as { exp?: number } | null;
    } catch {
      decoded = null; // the expiry is optional — never let it block the login session
    }
    return {
      accessToken: token,
      accessTokenExpiry: decoded?.exp ? new Date(decoded.exp * 1000).toISOString() : undefined,
    };
  }

  /** True when the HR response carries no data at all (null/blank/empty array or object, or the mapped array is empty). */
  private isEmptyLoginResult(body: unknown, mapped: unknown): boolean {
    if (Array.isArray(mapped) && mapped.length === 0) return true;
    if (body === null || body === undefined) return true;
    if (typeof body === 'string') return body.trim().length === 0;
    if (Array.isArray(body)) return body.length === 0;
    if (typeof body === 'object') return Object.keys(body as object).length === 0;
    return false;
  }

  private async issueSession(company: CompanyForMobileLogin, hrEmployeeId: string, hrName: string): Promise<MobileLoginResult> {
    const userId = buildStatelessUserKey(company.id, hrEmployeeId, hrName);
    const jti = generateSessionId();
    const ttlSeconds = await this.settingsService.getSessionTimeoutSeconds();

    const token = await this.jwtService.signAsync(
      { sub: userId, role: Role.EMPLOYEE, companyId: company.id, employeeId: hrEmployeeId, jti },
      { expiresIn: `${ttlSeconds}s` },
    );

    // PrismaSessionsRepository.create() takes the TTL as its second
    // argument (it computes the DB row's expiresAt from it) rather than a
    // hardcoded constant — see that class's own doc comment. Passing the
    // exact same `ttlSeconds` already used for the JWT's own `expiresIn`
    // above means the DB row and the token expire at the same moment, same
    // as AuthService.issueSession() does for web login sessions.
    await this.sessionsRepository.create(
      { token, userId, role: Role.EMPLOYEE, companyId: company.id, employeeId: hrEmployeeId },
      ttlSeconds,
    );

    // Audit trail without any employee value (no name, no HR id).
    this.systemLogsService.record({
      user: 'mobile-user',
      action: 'MOBILE_LOGIN',
      resource: 'Auth',
      description: 'An employee logged in from the mobile app.',
      metadata: { companyId: company.id },
    });

    return {
      token,
      employee: {
        id: hrEmployeeId,
        name: hrName,
        companyId: company.id,
        companyName: company.name,
      },
    };
  }
}
