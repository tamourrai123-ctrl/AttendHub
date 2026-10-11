import { Injectable } from '@nestjs/common';
import { AUTH_TYPE_CODES } from './constants/auth-type-codes.constant';
import { GatewayAuthOptions, GatewayCredentials, IntegrationGateway } from './interfaces/integration-gateway.interface';

/**
 * Basic Auth: integration_master has no dedicated username/password
 * columns (only api_key/api_secret). Per the task's explicit instruction
 * not to misuse those fields without documenting the limitation: this
 * gateway treats `api_key` as the Basic Auth username and `api_secret` as
 * the Basic Auth password. This is a deliberate, documented reuse of the
 * two generic credential columns — not a discovered convention — and is
 * called out again in the final report's minimum-schema recommendations
 * (a dedicated username/password pair, or clearer column naming, would
 * remove the need to overload api_key/api_secret's meaning per auth type).
 */
@Injectable()
export class BasicAuthGateway implements IntegrationGateway {
  readonly authTypeCode = AUTH_TYPE_CODES.BASIC_AUTH;

  async resolveAuthHeaders(credentials: GatewayCredentials, _options: GatewayAuthOptions): Promise<Record<string, string>> {
    const token = Buffer.from(`${credentials.apiKey}:${credentials.apiSecret}`, 'utf8').toString('base64');
    return { Authorization: `Basic ${token}` };
  }
}
