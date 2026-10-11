import { apiClient, type ApiSuccessResponse } from "./client";
import type { CreateFieldMappingInput, FieldMappingListResult, FieldMappingRecord, UpdateFieldMappingInput } from "../types/fieldMapping";

/**
 * Phase 2 (Company Admin — Endpoints tab, per-endpoint field mappings).
 * Talks to the real backend routes in
 * backend/src/integrations/field-mappings.controller.ts, nested under a
 * specific endpoint under a specific integration:
 *   GET    /integrations/:integrationId/endpoints/:endpointId/mappings
 *   POST   /integrations/:integrationId/endpoints/:endpointId/mappings
 *   PATCH  /integrations/:integrationId/endpoints/:endpointId/mappings/:mappingId
 *   DELETE /integrations/:integrationId/endpoints/:endpointId/mappings/:mappingId
 *
 * Same companyId-required pattern as api/endpoints.ts.
 */

interface RawFieldMappingListData {
  items: FieldMappingRecord[];
  meta: { page: number; limit: number; total: number };
}

function mappingsPath(integrationId: string, endpointId: string): string {
  return `/integrations/${encodeURIComponent(integrationId)}/endpoints/${encodeURIComponent(endpointId)}/mappings`;
}

export async function getFieldMappings(
  integrationId: string,
  endpointId: string,
  companyId: string,
  page = 1,
  limit = 50,
): Promise<FieldMappingListResult> {
  const response = await apiClient.get<ApiSuccessResponse<RawFieldMappingListData>>(mappingsPath(integrationId, endpointId), {
    companyId,
    page,
    limit,
  });
  const { items, meta } = response.data;
  return { items, page: meta.page, limit: meta.limit, total: meta.total };
}

export async function createFieldMapping(
  integrationId: string,
  endpointId: string,
  companyId: string,
  input: CreateFieldMappingInput,
): Promise<FieldMappingRecord> {
  const query = new URLSearchParams({ companyId }).toString();
  const response = await apiClient.post<ApiSuccessResponse<FieldMappingRecord>>(
    `${mappingsPath(integrationId, endpointId)}?${query}`,
    input,
  );
  return response.data;
}

export async function updateFieldMapping(
  integrationId: string,
  endpointId: string,
  companyId: string,
  mappingId: string,
  input: UpdateFieldMappingInput,
): Promise<FieldMappingRecord> {
  const query = new URLSearchParams({ companyId }).toString();
  const response = await apiClient.patch<ApiSuccessResponse<FieldMappingRecord>>(
    `${mappingsPath(integrationId, endpointId)}/${encodeURIComponent(mappingId)}?${query}`,
    input,
  );
  return response.data;
}

export async function deleteFieldMapping(
  integrationId: string,
  endpointId: string,
  companyId: string,
  mappingId: string,
): Promise<void> {
  const query = new URLSearchParams({ companyId }).toString();
  await apiClient.delete<ApiSuccessResponse<null>>(`${mappingsPath(integrationId, endpointId)}/${encodeURIComponent(mappingId)}?${query}`);
}
