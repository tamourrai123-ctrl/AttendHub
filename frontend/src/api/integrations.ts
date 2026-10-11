import { apiClient, type ApiSuccessResponse } from "./client";
import type {
  AuthTypeOption,
  ConnectionTestResult,
  CreateIntegrationInput,
  Integration,
  IntegrationConnectionStatus,
  IntegrationListQuery,
  IntegrationListResult,
  UpdateIntegrationInput,
} from "../types/integration";

/**
 * Real Integrations API — Super Admin's view. Talks to the actual backend
 * routes in backend/src/integrations/integrations.controller.ts:
 *   GET   /integrations              (query: page, limit — Super Admin only)
 *   PATCH /integrations/:id/status   (query: companyId; body: { status } — Super Admin only)
 *
 * Super Admin can only VIEW each company's integration here and toggle it
 * on/off. Creating or editing the connection itself (integration type, auth
 * type, base URL, credentials) belongs to the company's own admin — see
 * integrations.controller.ts's RBAC doc comment — and is out of scope for
 * this module.
 *
 * Same constraint as api/companies.ts and api/systemLogs.ts: the list
 * endpoint only supports `page`/`limit`, no server-side search or filter.
 */

interface RawIntegrationListData {
  items: Integration[];
  meta: { page: number; limit: number; total: number };
}

export async function getIntegrations(query: IntegrationListQuery = {}): Promise<IntegrationListResult> {
  const response = await apiClient.get<ApiSuccessResponse<RawIntegrationListData>>("/integrations", {
    page: query.page,
    limit: query.limit,
  });
  const { items, meta } = response.data;
  return { items, page: meta.page, limit: meta.limit, total: meta.total };
}

/**
 * `companyId` is required by the backend because `integration_master`'s
 * real primary key is composite: (company_id, id) — see the controller's
 * doc comment. Every row returned by getIntegrations() already carries its
 * own companyId, so callers always have it on hand.
 *
 * apiClient.patch has no query-params option (unlike .get), so the
 * companyId query string is built directly into the path here — buildUrl()
 * in api/client.ts passes an already-querystring'd path through untouched
 * when no separate params object is given.
 */
export async function updateIntegrationStatus(
  id: string,
  companyId: string,
  status: IntegrationConnectionStatus,
): Promise<Integration> {
  const query = new URLSearchParams({ companyId }).toString();
  const response = await apiClient.patch<ApiSuccessResponse<Integration>>(
    `/integrations/${encodeURIComponent(id)}/status?${query}`,
    { status },
  );
  return response.data;
}

/**
 * Phase 1 (Company Admin — Integrations tab) below. Talks to the three new
 * routes added to integrations.controller.ts. Unlike Super Admin's view
 * above, none of these need a companyId in the URL — the backend always
 * resolves it from the Company Admin's own session server-side.
 */

/** Returns `null` when the company hasn't created an integration yet — not an error. */
export async function getMyIntegration(): Promise<Integration | null> {
  const response = await apiClient.get<ApiSuccessResponse<Integration | null>>("/integrations/mine");
  return response.data;
}

/**
 * NOTE: calls the shared stateless tools route (/integrations/tools/auth-types),
 * not /integrations/auth-types — that route was a Phase 1 duplicate of
 * IntegrationToolsController's identical route and has since been removed
 * from IntegrationsController. See integration-tools.controller.ts.
 */
export async function getAuthTypeOptions(): Promise<AuthTypeOption[]> {
  const response = await apiClient.get<ApiSuccessResponse<AuthTypeOption[]>>("/integrations/tools/auth-types");
  return response.data;
}

export async function createMyIntegration(input: CreateIntegrationInput): Promise<Integration> {
  const response = await apiClient.post<ApiSuccessResponse<Integration>>("/integrations", input);
  return response.data;
}

/**
 * companyId is required by the backend the same way updateIntegrationStatus
 * above needs it (composite primary key) — the Company Admin's own
 * companyId, taken from the already-loaded Integration record, never typed
 * in by the user.
 */
export async function updateMyIntegration(
  id: string,
  companyId: string,
  input: UpdateIntegrationInput,
): Promise<Integration> {
  const query = new URLSearchParams({ companyId }).toString();
  const response = await apiClient.patch<ApiSuccessResponse<Integration>>(
    `/integrations/${encodeURIComponent(id)}?${query}`,
    input,
  );
  return response.data;
}

/**
 * apiClient.post has no query-params option either (same limitation as
 * .patch/.delete — see api/client.ts), so companyId is built into the path
 * here too.
 */
export async function testIntegrationConnection(id: string, companyId: string): Promise<ConnectionTestResult> {
  const query = new URLSearchParams({ companyId }).toString();
  const response = await apiClient.post<ApiSuccessResponse<ConnectionTestResult>>(
    `/integrations/${encodeURIComponent(id)}/test-connection?${query}`,
  );
  return response.data;
}
