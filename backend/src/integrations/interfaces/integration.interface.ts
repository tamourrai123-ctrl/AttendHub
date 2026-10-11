/**
 * Shape returned by the Integrations API, backed by the real
 * `integration_master` table (see PrismaIntegrationsRepository).
 *
 * Credential fields (api_key / api_secret) are deliberately NOT part of
 * this type and must never be added to it. Those values may only be read
 * internally by the repository (e.g. to make a future outbound call to an
 * HR system) and must never cross the response boundary, appear in API
 * logs, appear in system logs, or appear in an error message. See the
 * Integrations migration report, section F.
 *
 * provider, lastSyncAt, lastTestResult, lastTestedAt, and fieldMappings
 * from the pre-migration in-memory model have been removed entirely — none
 * of them has a corresponding column in integration_master, and returning
 * them as always-null/empty placeholders would misrepresent what this API
 * actually persists. See the Integrations migration report, section D.
 */
export type IntegrationStatus = 'CONNECTED' | 'DISCONNECTED';

export interface Integration {
  id: string;
  companyId: string;
  companyName: string;
  integrationType: string;
  authType: string;
  baseUrl: string;
  status: IntegrationStatus;
  credentialsConfigured: boolean;
}
