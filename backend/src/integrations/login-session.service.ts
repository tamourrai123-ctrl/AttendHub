import { BadGatewayException, BadRequestException, Injectable, Logger } from '@nestjs/common';
import { SystemLogsService } from '../system-logs/system-logs.service';
import { IntegrationsService } from './integrations.service';
import { PrismaEndpointsRepository } from './repositories/prisma-endpoints.repository';
import { PrismaFieldMappingsRepository } from './repositories/prisma-field-mappings.repository';
import { FieldMappingService } from './services/field-mapping.service';
import { IntegrationEndpointExecutorService } from './services/integration-endpoint-executor.service';
import { LOGIN_SESSION_ENDPOINT_NAME } from './constants/reserved-endpoint-names.constant';
import { findEndpointPurposeByName } from './constants/endpoint-purposes.constant';
import { HrLoginSessionDto } from './dto/hr-login-session.dto';
import { hrBodyReportsFailure } from './utils/hr-failure-body.util';
import { isTokenSourcePath } from './utils/sensitive-source-path.util';

/** What the hub knows about this login. Token values (if any) are passed straight to HR and are never logged or stored. */
export type LoginSessionInput = Omit<HrLoginSessionDto, 'deviceId'> & {
  deviceId?: string;
  accessToken?: string;
  refreshToken?: string;
  accessTokenExpiry?: string;
  refreshTokenExpiry?: string;
};

/**
 * Forwards the device's login-session registration to the company's HR system (HR's login_sessions API) and
 * returns ONLY the fields the admin mapped back (none by default). Nothing is stored. The session tokens, if the
 * admin mapped them, go to HR only; they are never logged, stored or returned to the app, and the HR response
 * body is never returned or logged.
 */
@Injectable()
export class LoginSessionService {
  private readonly logger = new Logger(LoginSessionService.name);

  constructor(
    private readonly integrationsService: IntegrationsService,
    private readonly endpointsRepository: PrismaEndpointsRepository,
    private readonly fieldMappingsRepository: PrismaFieldMappingsRepository,
    private readonly fieldMappingEngine: FieldMappingService,
    private readonly executor: IntegrationEndpointExecutorService,
    private readonly systemLogsService: SystemLogsService,
  ) {}

  async register(companyId: string, employeeId: string, dto: LoginSessionInput): Promise<Record<string, unknown>[]> {
    const integration = await this.integrationsService.findMineForCompany(companyId);
    if (!integration || integration.status !== 'CONNECTED') {
      throw new BadRequestException('Your HR integration is not set up yet (or is currently disabled).');
    }

    const endpoint = await this.endpointsRepository.findByIntegrationAndName(companyId, integration.id, LOGIN_SESSION_ENDPOINT_NAME);
    if (!endpoint) {
      throw new BadRequestException('Your company has not configured a "Login Session" endpoint yet.');
    }

    const purpose = findEndpointPurposeByName(LOGIN_SESSION_ENDPOINT_NAME);
    const requestFields = (purpose?.requestFields ?? []).map((field) => field.field);
    const responseFields = (purpose?.responseFields ?? []).map((field) => field.field);

    const mappings = await this.fieldMappingsRepository.findActiveByEndpoint(companyId, integration.id, endpoint.id);
    const domainMappings = mappings.map((mapping) => this.fieldMappingEngine.toDomainMapping(mapping));
    const requestMappings = domainMappings.filter((mapping) => requestFields.includes(mapping.sourcePath));
    const responseMappings = domainMappings.filter((mapping) => responseFields.includes(mapping.targetField));

    if (requestMappings.length === 0) {
      throw new BadRequestException('The "Login Session" endpoint has no field mappings configured yet.');
    }
    if (responseMappings.some((mapping) => isTokenSourcePath(mapping.sourcePath))) {
      throw new BadRequestException(
        'The "Login Session" endpoint has a field mapping that reads an access/refresh token. Token fields must never be mapped — remove that mapping.',
      );
    }

    // company_id always comes from the session, never from the request body. Only fields the admin mapped are sent.
    const nowIso = new Date().toISOString();
    const sourceRecord: Record<string, unknown> = {
      companyId,
      userId: dto.userId,
      accessToken: dto.accessToken,
      refreshToken: dto.refreshToken,
      accessTokenExpiry: dto.accessTokenExpiry,
      refreshTokenExpiry: dto.refreshTokenExpiry,
      deviceId: dto.deviceId,
      deviceName: dto.deviceName,
      appVersion: dto.appVersion,
      ipAddress: dto.ipAddress,
      lastAccessTime: nowIso,
      status: 'ACTIVE',
      createdOn: nowIso,
    };
    const requestBody = this.fieldMappingEngine.apply(sourceRecord, requestMappings);

    const result = await this.executor.execute(companyId, integration.id, endpoint.id, {}, requestBody);
    const hrRejected = result.success && hrBodyReportsFailure(result.body);
    const delivered = result.success && !hrRejected;

    // Outcome only: never the device values or the HR response (it holds tokens).
    this.systemLogsService.record({
      user: 'mobile-user',
      action: delivered ? 'LOGIN_SESSION_REGISTERED' : 'LOGIN_SESSION_REGISTER_FAILED',
      resource: 'Auth',
      resourceId: endpoint.id,
      severity: delivered ? 'INFO' : 'WARNING',
      description: delivered
        ? `Registered a login session with HR (HTTP ${result.statusCode}).`
        : `Failed to register a login session with HR: ${result.error ?? (hrRejected ? 'HR reported the record as failed' : `HTTP ${result.statusCode}`)}.`,
      metadata: { companyId, integrationId: integration.id, endpointId: endpoint.id, statusCode: result.statusCode, durationMs: result.durationMs },
    });

    if (!delivered) {
      this.logger.warn(`Login session registration failed for company ${companyId}.`);
      throw new BadGatewayException(
        result.error ?? (hrRejected ? 'Your HR system did not accept this login session. Please try again.' : 'Could not reach your HR system to register this login session. Please try again.'),
      );
    }

    if (responseMappings.length === 0) {
      return [];
    }
    const applied = this.fieldMappingEngine.applyToResponse(result.body, responseMappings);
    return Array.isArray(applied) ? (applied as Record<string, unknown>[]) : [applied as Record<string, unknown>];
  }
}
