import { apiClient, type ApiSuccessResponse } from "./client";
import type {
  CreateEndpointInput,
  EndpointListResult,
  EndpointPurpose,
  IntegrationEndpoint,
  TestEndpointResult,
  UpdateEndpointInput,
} from "../types/endpoint";

/**
 * Phase 2 (Company Admin — Endpoints tab). Talks to the real backend routes
 * in backend/src/integrations/endpoints.controller.ts, nested under a
 * specific integration:
 *   GET    /integrations/:integrationId/endpoints
 *   GET    /integrations/:integrationId/endpoints/:endpointId
 *   POST   /integrations/:integrationId/endpoints
 *   PATCH  /integrations/:integrationId/endpoints/:endpointId
 *   DELETE /integrations/:integrationId/endpoints/:endpointId
 *   POST   /integrations/:integrationId/endpoints/:endpointId/test
 *
 * companyId is required by every route (composite-key ownership check —
 * same pattern as api/integrations.ts). GET routes pass it through
 * apiClient.get's params object; POST/PATCH/DELETE build it into the path
 * since apiClient has no params option for those verbs.
 */

interface RawEndpointListData {
  items: IntegrationEndpoint[];
  meta: { page: number; limit: number; total: number };
}

export async function getEndpoints(
  integrationId: string,
  companyId: string,
  page = 1,
  limit = 50,
): Promise<EndpointListResult> {
  const response = await apiClient.get<ApiSuccessResponse<RawEndpointListData>>(
    `/integrations/${encodeURIComponent(integrationId)}/endpoints`,
    { companyId, page, limit },
  );
  const { items, meta } = response.data;
  return { items, page: meta.page, limit: meta.limit, total: meta.total };
}

export async function getEndpoint(
  integrationId: string,
  companyId: string,
  endpointId: string,
): Promise<IntegrationEndpoint> {
  const response = await apiClient.get<ApiSuccessResponse<IntegrationEndpoint>>(
    `/integrations/${encodeURIComponent(integrationId)}/endpoints/${encodeURIComponent(endpointId)}`,
    { companyId },
  );
  return response.data;
}

export async function createEndpoint(
  integrationId: string,
  companyId: string,
  input: CreateEndpointInput,
): Promise<IntegrationEndpoint> {
  const query = new URLSearchParams({ companyId }).toString();
  const response = await apiClient.post<ApiSuccessResponse<IntegrationEndpoint>>(
    `/integrations/${encodeURIComponent(integrationId)}/endpoints?${query}`,
    input,
  );
  return response.data;
}

export async function updateEndpoint(
  integrationId: string,
  companyId: string,
  endpointId: string,
  input: UpdateEndpointInput,
): Promise<IntegrationEndpoint> {
  const query = new URLSearchParams({ companyId }).toString();
  const response = await apiClient.patch<ApiSuccessResponse<IntegrationEndpoint>>(
    `/integrations/${encodeURIComponent(integrationId)}/endpoints/${encodeURIComponent(endpointId)}?${query}`,
    input,
  );
  return response.data;
}

export async function deleteEndpoint(integrationId: string, companyId: string, endpointId: string): Promise<void> {
  const query = new URLSearchParams({ companyId }).toString();
  await apiClient.delete<ApiSuccessResponse<null>>(
    `/integrations/${encodeURIComponent(integrationId)}/endpoints/${encodeURIComponent(endpointId)}?${query}`,
  );
}

/**
 * Live outbound call to the external HR system (Company Admin's own
 * credentials). Intended for INBOUND (GET) endpoints only in this phase's
 * UI — never wired to a live call for an OUTBOUND/POST purpose endpoint,
 * since that would create a real record on the external HR system. See
 * EndpointsPanel: OUTBOUND endpoints use previewFieldMapping() (a stateless
 * dry run) instead.
 */
export async function testEndpoint(
  integrationId: string,
  companyId: string,
  endpointId: string,
  queryParams?: Record<string, string>,
  sampleRecord?: Record<string, unknown>,
): Promise<TestEndpointResult> {
  const query = new URLSearchParams({ companyId }).toString();
  const response = await apiClient.post<ApiSuccessResponse<TestEndpointResult>>(
    `/integrations/${encodeURIComponent(integrationId)}/endpoints/${encodeURIComponent(endpointId)}/test?${query}`,
    { queryParams, sampleRecord },
  );
  return response.data;
}

/**
 * Fixed, code-defined catalogue of endpoint "purposes" — see backend's
 * constants/endpoint-purposes.constant.ts. Stateless (no companyId needed).
 */
export async function getEndpointPurposes(): Promise<EndpointPurpose[]> {
  const response = await apiClient.get<ApiSuccessResponse<EndpointPurpose[]>>("/integrations/tools/endpoint-purposes");
  return response.data;
}
