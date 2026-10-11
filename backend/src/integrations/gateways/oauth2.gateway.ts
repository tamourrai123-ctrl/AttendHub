import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AUTH_TYPE_CODES } from './constants/auth-type-codes.constant';
import { GatewayAuthOptions, GatewayCredentials, IntegrationGateway } from './interfaces/integration-gateway.interface';

/**
 * OAuth 2.0 (client_credentials grant): integration_master has no
 * dedicated token-URL column, so the token endpoint cannot live on
 * integration_master itself without a schema change. Instead, per the
 * "no new/duplicate tables, reuse integration_detail" instruction, this
 * gateway expects the caller (IntegrationEndpointExecutorService) to
 * resolve the token URL from a sibling integration_detail row reserved by
 * name (see integration-endpoint-executor.service.ts's
 * OAUTH2_TOKEN_ENDPOINT_NAME) and pass it in as `options.tokenUrl`. If no
 * such row is configured, this throws a clear, actionable error instead of
 * silently skipping authentication.
 *
 * api_key/api_secret are reused as the OAuth2 client_id/client_secret —
 * again a documented reuse of the two generic credential columns, called
 * out in the final report's minimum-schema recommendations.
 *
 * Deliberately NOT implemented here (kept out per "avoid over-engineering"):
 * token caching/reuse across calls, refresh-token grants, non-client-
 * credentials grants. Every call fetches a fresh token. This is a
 * reasonable first pass; caching is flagged as a future optimization, not
 * a missing requirement of this task.
 */
@Injectable()
export class OAuth2Gateway implements IntegrationGateway {
  private readonly logger = new Logger(OAuth2Gateway.name);
  readonly authTypeCode = AUTH_TYPE_CODES.OAUTH2;

  async resolveAuthHeaders(credentials: GatewayCredentials, options: GatewayAuthOptions): Promise<Record<string, string>> {
    if (!options.tokenUrl) {
      throw new BadRequestException(
        'OAuth 2.0 auth requires a token endpoint. Configure an endpoint under this integration named ' +
          '"OAUTH2_TOKEN_ENDPOINT" (see IntegrationEndpointExecutorService) before testing or executing this call.',
      );
    }

    let response: Response;
    try {
      response = await fetch(options.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: credentials.apiKey,
          client_secret: credentials.apiSecret,
        }).toString(),
      });
    } catch (error) {
      // Never include the error object verbatim — some HTTP client errors
      // embed the request (which would include the client_secret in the body).
      this.logger.error(`OAuth2 token request failed to reach ${options.tokenUrl}`);
      throw new BadRequestException('Could not reach the OAuth 2.0 token endpoint.');
    }

    if (!response.ok) {
      throw new BadRequestException(`OAuth 2.0 token endpoint responded with HTTP ${response.status}.`);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new BadRequestException('OAuth 2.0 token endpoint did not return valid JSON.');
    }

    const accessToken =
      payload && typeof payload === 'object' && 'access_token' in payload
        ? (payload as { access_token?: unknown }).access_token
        : undefined;

    if (typeof accessToken !== 'string' || accessToken.length === 0) {
      throw new BadRequestException("OAuth 2.0 token endpoint response did not include an 'access_token'.");
    }

    return { Authorization: `Bearer ${accessToken}` };
  }
}
