/**
 * MOCK-ERA shape — kept only for the still-mock-driven Dashboard
 * "Integration Health" panel and services/mockIntegrationService.ts (see
 * Dashboard.tsx's own comment: switching those to the real API is a
 * separate, future "Dashboard" integration step, not part of the Super
 * Admin Integrations screen rebuild).
 *
 * Deliberately named with a `Mock` prefix and kept out of
 * types/integration.ts, which now holds the REAL backend `Integration`
 * shape (see integrations.controller.ts / integration.interface.ts) used
 * by the real Super Admin Integrations screen and api/integrations.ts.
 * Same separation already used for `MockEmployeeStatus` in
 * lib/statusBadges.ts — a mock data layer keeps its own type once the real
 * type it used to share has diverged, rather than forcing the real type to
 * carry fake fields (provider, lastSyncAt, lastTestResult, lastTestedAt,
 * fieldMappings, and a 5-value status) that don't exist on the backend.
 */

export type MockIntegrationAuthType = "API_KEY" | "BEARER_TOKEN" | "BASIC_AUTH" | "OAUTH2";

export type MockIntegrationStatus = "CONNECTED" | "DISCONNECTED" | "WARNING" | "ERROR" | "TESTING";

export interface MockFieldMapping {
  standardField: string;
  standardLabel: string;
  externalField: string;
}

/**
 * Credential fields are intentionally NOT part of this type, mock or real —
 * only a `credentialsConfigured` boolean is tracked. See
 * mockIntegrationService.ts for the full rationale.
 */
export interface MockIntegration {
  id: string;
  companyId: string;
  companyName: string;
  integrationType: string;
  provider: string;
  status: MockIntegrationStatus;
  baseUrl: string;
  authType: MockIntegrationAuthType;
  credentialsConfigured: boolean;
  /** ISO timestamp, or null if never synced */
  lastSyncAt: string | null;
  lastTestResult: "PASSED" | "FAILED" | null;
  /** ISO timestamp, or null if never tested */
  lastTestedAt: string | null;
  fieldMappings: MockFieldMapping[];
}

export interface MockTestConnectionResult {
  success: boolean;
  message: string;
  responseTimeMs?: number;
  testedAt: string;
}

export interface MockUpdateIntegrationInput {
  baseUrl?: string;
  authType?: MockIntegrationAuthType;
  /** True once the admin has (re-)entered credentials in the form. */
  credentialsConfigured?: boolean;
}
