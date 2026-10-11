import { fillPathPlaceholders } from '../utils/path-placeholders.util';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { LovService } from '../../lov/lov.service';
import { LOV_GROUPS } from '../../lov/constants/lov-groups.constant';
import { PrismaIntegrationsRepository } from '../repositories/prisma-integrations.repository';
import { PrismaEndpointsRepository } from '../repositories/prisma-endpoints.repository';
import { IntegrationGatewayFactory } from '../gateways/integration-gateway.factory';
import { OAUTH2_TOKEN_ENDPOINT_NAME } from '../constants/reserved-endpoint-names.constant';
import { AUTH_TYPE_CODES } from '../gateways/constants/auth-type-codes.constant';

export interface ExecutionResult {
  success: boolean;
  /** 0 when the external call never reached the server (network/DNS/timeout failure) — never a real HTTP status. */
  statusCode: number;
  durationMs: number;
  body: unknown;
  /** Sanitized, human-readable failure reason. Never includes api_key/api_secret/tokens or the resolved Authorization header. */
  error?: string;
}

/**
 * Deliberately a separate shape from ExecutionResult: `reachable` (not
 * `success`) because a bare connection test has no business endpoint to
 * judge "did this call succeed" against — an unauthenticated root URL
 * commonly 404s by design, which does not mean the connection is broken.
 * See testConnection()'s own doc comment for exactly what counts as
 * reachable.
 */
export interface ConnectionTestResult {
  reachable: boolean;
  /** 0 when the external call never reached the server at all — never a real HTTP status. */
  statusCode: number;
  durationMs: number;
  /** Sanitized, human-readable failure reason. Never includes api_key/api_secret/tokens or the resolved Authorization header. */
  error?: string;
}

const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Controller -> Service -> Repository -> Gateway/Executor -> External API,
 * per the task's required layering. Only IntegrationsController and
 * EndpointsController (via EndpointsService) call into this class; it never
 * runs inside a controller method directly.
 *
 * Loads integration_master's raw credentials (never the public Integration
 * type — see PrismaIntegrationsRepository.findCredentialsForExecution) and
 * the target integration_detail row, validates the auth type against LOV,
 * resolves the right gateway, builds the request, and executes it. Never
 * logs credentials, resolved auth headers, or the resolved Authorization
 * value — only the target host/path and the outcome.
 */
@Injectable()
export class IntegrationEndpointExecutorService {
  private readonly logger = new Logger(IntegrationEndpointExecutorService.name);

  constructor(
    private readonly integrationsRepository: PrismaIntegrationsRepository,
    private readonly endpointsRepository: PrismaEndpointsRepository,
    private readonly lovService: LovService,
    private readonly gatewayFactory: IntegrationGatewayFactory,
  ) {}

  /**
   * `requestBody` (Phase 2/Part B): sent as a JSON-encoded body ONLY when
   * `endpoint.httpMethod` is not GET — a GET request is never given a body
   * here, matching how every HTTP client/server actually treats one (most
   * either drop it or reject it). Passing a body against a GET endpoint is
   * silently ignored rather than erroring, since the caller (e.g.
   * AttendancePunchService) always builds it from the same mapped record
   * regardless of the endpoint's configured method. Before this parameter
   * was added, execute() sent every request (test AND real business calls)
   * with no body at all, even for POST — fine for the read-only Endpoints
   * "Test" button, but it meant an Outbound (e.g. ATTENDANCE_POST) endpoint
   * could never actually deliver any data. `undefined` — the previous,
   * default behavior — still sends no body at all, so this call remains
   * unchanged for every existing caller (EndpointsService.testEndpoint()).
   */
  async execute(
    companyId: string,
    integrationId: string,
    endpointId: string,
    queryParams: Record<string, string> = {},
    requestBody?: unknown,
  ): Promise<ExecutionResult> {
    const credentials = await this.integrationsRepository.findCredentialsForExecution(companyId, integrationId);
    if (!credentials) {
      throw new NotFoundException('Integration not found.');
    }

    const endpoint = await this.endpointsRepository.findByCompositeId(companyId, endpointId);
    if (!endpoint || endpoint.integrationId !== integrationId) {
      throw new NotFoundException('Endpoint not found.');
    }

    if (!credentials.authType || !(await this.lovService.isValidValue(LOV_GROUPS.INTEGRATION_AUTH_TYPE, credentials.authType))) {
      throw new BadRequestException(
        `This integration's auth type ('${credentials.authType ?? ''}') is not a recognized, active entry in the ` +
          `${LOV_GROUPS.INTEGRATION_AUTH_TYPE} LOV group. Seed/activate it (see scripts/seed-integration-auth-type-lov.ts) before testing or executing this endpoint.`,
      );
    }

    let tokenUrl: string | undefined;
    if (credentials.authType === AUTH_TYPE_CODES.OAUTH2) {
      const tokenEndpoint = await this.endpointsRepository.findByIntegrationAndName(
        companyId,
        integrationId,
        OAUTH2_TOKEN_ENDPOINT_NAME,
      );
      if (tokenEndpoint) {
        tokenUrl = this.buildUrl(credentials.baseUrl, tokenEndpoint.endpoint, {});
      }
      // If no token endpoint row exists, tokenUrl stays undefined and
      // OAuth2Gateway itself throws a clear, actionable error — no need to
      // duplicate that check here.
    }

    const gateway = this.gatewayFactory.create(credentials.authType);
    const authHeaders = await gateway.resolveAuthHeaders(
      { apiKey: credentials.apiKey, apiSecret: credentials.apiSecret },
      { tokenUrl },
    );

    const url = this.buildUrl(credentials.baseUrl, endpoint.endpoint, queryParams);
    const sendsBody = endpoint.httpMethod !== 'GET' && requestBody !== undefined;
    const startedAt = Date.now();

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      let response: Response;
      try {
        response = await fetch(url, {
          method: endpoint.httpMethod,
          headers: {
            Accept: 'application/json',
            // Some HR hosts' firewalls (e.g. Akamai) reject requests with no User-Agent.
            'User-Agent': 'AttendHub-Gateway/1.0',
            ...authHeaders,
            ...(sendsBody ? { 'Content-Type': 'application/json' } : {}),
          },
          body: sendsBody ? JSON.stringify(requestBody) : undefined,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      const durationMs = Date.now() - startedAt;
      const body = await this.readBody(response);

      return { success: response.ok, statusCode: response.status, durationMs, body };
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      // Logs the configured TEMPLATE path (placeholders such as {{username}}
      // left unresolved), never the resolved `url`: a resolved path can hold
      // an employee name/id or a password. The error object itself is not
      // logged verbatim since some HTTP client errors embed request headers.
      this.logger.warn(`Endpoint call failed: ${endpoint.httpMethod} ${this.redactUrl(`${credentials.baseUrl}${endpoint.endpoint}`)}`);
      const timedOut = error instanceof Error && error.name === 'AbortError';
      return {
        success: false,
        statusCode: 0,
        durationMs,
        body: null,
        error: timedOut ? 'The external API did not respond in time.' : 'Could not reach the external API.',
      };
    }
  }

  /**
   * Tests just the integration's base connection — no endpoint required.
   * Used by the Company Admin's Integrations tab, before any endpoint has
   * ever been configured. execute() (above) tests a specific, already-
   * configured business endpoint and judges success by a 2xx response;
   * this method has no business endpoint to call, so it judges only
   * reachability, not correctness of any particular response.
   *
   * For API_KEY/BASIC_AUTH: resolving auth headers needs no network call,
   * so real headers are attached to a plain GET against the integration's
   * base URL exactly as stored (no path appended). ANY completed HTTP
   * response — even a 401/404 — is reported as reachable; only a network-
   * level failure (DNS/timeout/connection refused) is not. This
   * deliberately does not assert the credentials are correct, since there
   * is no known business endpoint yet to distinguish "wrong key" from
   * "this URL simply has nothing at its root."
   *
   * For OAUTH2: a token can only be requested once an OAUTH2_TOKEN_ENDPOINT
   * endpoint exists (see this class's doc comment) — since this method
   * runs before any endpoint is configured, resolveAuthHeaders() correctly
   * throws that same clear, actionable error rather than silently skipping
   * authentication or pretending the connection was tested.
   */
  async testConnection(companyId: string, integrationId: string): Promise<ConnectionTestResult> {
    const credentials = await this.integrationsRepository.findCredentialsForExecution(companyId, integrationId);
    if (!credentials) {
      throw new NotFoundException('Integration not found.');
    }

    if (!credentials.authType || !(await this.lovService.isValidValue(LOV_GROUPS.INTEGRATION_AUTH_TYPE, credentials.authType))) {
      throw new BadRequestException(
        `This integration's auth type ('${credentials.authType ?? ''}') is not a recognized, active entry in the ` +
          `${LOV_GROUPS.INTEGRATION_AUTH_TYPE} LOV group. Seed/activate it (see scripts/seed-integration-auth-type-lov.ts) before testing this connection.`,
      );
    }

    const gateway = this.gatewayFactory.create(credentials.authType);
    // No tokenUrl is passed — OAuth2Gateway throws its own clear error here
    // if this integration is OAuth2, since no endpoint exists yet to supply
    // one (exactly the state a brand-new integration is in).
    const authHeaders = await gateway.resolveAuthHeaders(
      { apiKey: credentials.apiKey, apiSecret: credentials.apiSecret },
      {},
    );

    const startedAt = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      let response: Response;
      try {
        response = await fetch(credentials.baseUrl, {
          method: 'GET',
          headers: { Accept: 'application/json', ...authHeaders },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      const durationMs = Date.now() - startedAt;
      return { reachable: true, statusCode: response.status, durationMs };
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      this.logger.warn(`Test connection failed: GET ${this.redactUrl(credentials.baseUrl)}`);
      const timedOut = error instanceof Error && error.name === 'AbortError';
      return {
        reachable: false,
        statusCode: 0,
        durationMs,
        error: timedOut ? 'The external API did not respond in time.' : 'Could not reach the external API.',
      };
    }
  }

  private async readBody(response: Response): Promise<unknown> {
    const text = await response.text();
    if (!text) {
      return null;
    }
    try {
      return JSON.parse(text);
    } catch {
      // Non-JSON response (XML/plain text/HTML error page) — returned as a
      // raw string rather than failing the whole call, since request_type/
      // response_type on the endpoint config are informational, not
      // enforced at the HTTP layer.
      return text;
    }
  }

  private buildUrl(baseUrl: string, endpointPath: string, queryParams: Record<string, string>): string {
    return `${baseUrl.replace(/\/+$/, '')}${fillPathPlaceholders(endpointPath, queryParams)}`;
  }

  /** Strips query string before logging — a placeholder left unfilled could coincidentally look sensitive; host+path is enough to diagnose a failure. */
  private redactUrl(url: string): string {
    return url.split('?')[0];
  }
}
