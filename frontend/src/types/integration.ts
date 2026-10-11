/**
 * Matches the real backend's Integration shape exactly — see
 * backend/src/integrations/interfaces/integration.interface.ts.
 *
 * The pre-migration mock fields (`provider`, a 4-value `authType` enum,
 * `lastSyncAt`, `lastTestResult`, `lastTestedAt`, and an embedded
 * `fieldMappings` array) have been removed entirely: none of them has a
 * corresponding column in `integration_master`, and none of them is
 * returned by the real API — see the Integrations migration report,
 * section D. Endpoint and field-mapping management now live in their own
 * controllers (endpoints.controller.ts / field-mappings.controller.ts) and
 * belong to Company Admin, not to this Super-Admin-facing type.
 *
 * The old mock-era shape — still used by the not-yet-migrated Dashboard
 * "Integration Health" panel — has moved to types/mockIntegration.ts as
 * `MockIntegration`, so it can keep its own fake fields/statuses without
 * this type having to carry them.
 *
 * Credential fields (api_key / api_secret) are intentionally NOT part of
 * this type and must never be added to it — only whether credentials have
 * been configured is exposed, never their value.
 */
export type IntegrationConnectionStatus = "CONNECTED" | "DISCONNECTED";

export interface Integration {
  id: string;
  companyId: string;
  companyName: string;
  integrationType: string;
  authType: string;
  baseUrl: string;
  status: IntegrationConnectionStatus;
  credentialsConfigured: boolean;
}

export interface IntegrationListQuery {
  page?: number;
  limit?: number;
}

export interface IntegrationListResult {
  items: Integration[];
  page: number;
  limit: number;
  total: number;
}

/**
 * Phase 1 (Company Admin — Integrations tab) additions below. These mirror
 * backend/src/integrations/dto/{create,update}-integration.dto.ts and
 * services/integration-endpoint-executor.service.ts's ConnectionTestResult
 * exactly — see integrations.controller.ts's new routes:
 *   GET  /integrations/mine
 *   GET  /integrations/auth-types
 *   POST /integrations/:id/test-connection
 */
export interface CreateIntegrationInput {
  integrationType: string;
  authType: string;
  baseUrl: string;
  apiKey: string;
  apiSecret: string;
}

/** Every field optional — apiKey/apiSecret are only sent when the admin is actually rotating them. */
export interface UpdateIntegrationInput {
  integrationType?: string;
  authType?: string;
  baseUrl?: string;
  apiKey?: string;
  apiSecret?: string;
}

/**
 * A completed HTTP response (even 401/404) is `reachable: true` — see the
 * backend's ConnectionTestResult doc comment. `reachable: false` only
 * happens on a network-level failure (DNS/timeout/connection refused).
 */
export interface ConnectionTestResult {
  reachable: boolean;
  statusCode: number;
  durationMs: number;
  error?: string;
}

/** One active INTEGRATION_AUTH_TYPE LOV row — see LovService.getActiveOptions(). */
export interface AuthTypeOption {
  value: string;
  title: string;
  sorting: number;
}
