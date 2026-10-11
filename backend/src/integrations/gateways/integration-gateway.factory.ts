import { Injectable } from '@nestjs/common';
import { AUTH_TYPE_CODES } from './constants/auth-type-codes.constant';
import { ApiKeyGateway } from './api-key.gateway';
import { BasicAuthGateway } from './basic-auth.gateway';
import { OAuth2Gateway } from './oauth2.gateway';
import { IntegrationGateway } from './interfaces/integration-gateway.interface';

/**
 * Strategy-selection factory: given an auth_type code, returns the gateway
 * that knows how to authenticate that call. Callers must validate the code
 * against LovService (LOV_GROUPS.INTEGRATION_AUTH_TYPE) BEFORE calling
 * create() — see IntegrationEndpointExecutorService — so an integration
 * whose auth_type was never seeded/activated in LOV never reaches here at
 * all. create() itself still guards with a clear error as defense in depth,
 * not as the primary validation gate.
 */
@Injectable()
export class IntegrationGatewayFactory {
  constructor(
    private readonly apiKeyGateway: ApiKeyGateway,
    private readonly basicAuthGateway: BasicAuthGateway,
    private readonly oauth2Gateway: OAuth2Gateway,
  ) {}

  create(authTypeCode: string): IntegrationGateway {
    switch (authTypeCode) {
      case AUTH_TYPE_CODES.API_KEY:
        return this.apiKeyGateway;
      case AUTH_TYPE_CODES.BASIC_AUTH:
        return this.basicAuthGateway;
      case AUTH_TYPE_CODES.OAUTH2:
        return this.oauth2Gateway;
      default:
        throw new Error(`No gateway is implemented for auth type '${authTypeCode}'.`);
    }
  }
}
