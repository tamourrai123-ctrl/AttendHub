/**
 * Auth gateway abstraction. Each concrete gateway knows how to turn an
 * integration's stored credentials into the HTTP headers an outbound call
 * needs — nothing else. Building the request (method/url/query/body) and
 * actually sending it is IntegrationEndpointExecutorService's job, not the
 * gateway's; this keeps each gateway a small, independently testable unit
 * with a single responsibility, per the "do not over-engineer" instruction.
 *
 * integration_master only has two generic credential columns (api_key,
 * api_secret) — there is no dedicated username/password pair, no header-
 * name column, and no token-endpoint column. Per the task's explicit "do
 * not modify the database schema without justification" instruction, the
 * three gateways below reuse those two columns with a documented meaning
 * specific to each auth type (see each gateway's own comment), rather than
 * a schema change. The "minimum schema recommended" section of the final
 * report calls out where a dedicated column (e.g. a token URL for OAuth2)
 * would remove the workaround described there.
 */
export interface GatewayCredentials {
  apiKey: string;
  apiSecret: string;
}

/** Extra, auth-type-specific inputs a gateway may need beyond the two credential columns. */
export interface GatewayAuthOptions {
  /**
   * Full URL of the OAuth2 token endpoint, when known. Only consulted by
   * OAuth2Gateway. See IntegrationEndpointExecutorService for how this is
   * resolved (a sibling integration_detail row with a reserved name — no
   * schema change).
   */
  tokenUrl?: string;
}

export interface IntegrationGateway {
  /** The AUTH_TYPE_CODES value this gateway handles — used only for error messages/logging, never for dispatch (the factory owns dispatch). */
  readonly authTypeCode: string;

  /**
   * Resolves the HTTP headers an outbound call must carry for this auth
   * type. May itself make a network call (OAuth2's token request) — callers
   * must treat this as fallible and must never log the returned headers or
   * the credentials passed in.
   */
  resolveAuthHeaders(credentials: GatewayCredentials, options: GatewayAuthOptions): Promise<Record<string, string>>;
}
