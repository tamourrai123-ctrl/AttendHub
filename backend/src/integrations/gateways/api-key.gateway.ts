import { Injectable } from '@nestjs/common';
import { AUTH_TYPE_CODES } from './constants/auth-type-codes.constant';
import { GatewayAuthOptions, GatewayCredentials, IntegrationGateway } from './interfaces/integration-gateway.interface';

/**
 * API Key auth: integration_master.api_key is sent as a header value.
 * api_secret is unused for this auth type (an integration created with
 * auth_type API is not required to have a meaningful api_secret beyond
 * whatever placeholder the caller supplied — api_secret remains a required
 * NOT NULL column on integration_master regardless of auth type, per the
 * existing schema, and this gateway simply never reads it).
 *
 * There is no column recording a custom header name, so 'X-API-Key' is
 * used as a fixed, documented convention (distinct from OAuth2Gateway's
 * 'Authorization: Bearer', so the two auth types remain visibly different
 * in an outbound request even though both ultimately send a bearer-style
 * secret). A future header-name column would remove the need for this
 * convention — see the final report's minimum-schema recommendations.
 */
@Injectable()
export class ApiKeyGateway implements IntegrationGateway {
  readonly authTypeCode = AUTH_TYPE_CODES.API_KEY;

  async resolveAuthHeaders(credentials: GatewayCredentials, _options: GatewayAuthOptions): Promise<Record<string, string>> {
    return { 'X-API-Key': credentials.apiKey };
  }
}
