import { apiClient, type ApiSuccessResponse } from "./client";
import type { GlobalEndpoint, GlobalEndpointInput, GlobalEndpointListResult } from "../types/globalEndpoint";

/**
 *   GET    /global-endpoints            Super Admin, paginated
 *   GET    /global-endpoints/available  Super Admin + Company Admin, active ones only
 *   POST   /global-endpoints            Super Admin
 *   PATCH  /global-endpoints/:id        Super Admin
 *   DELETE /global-endpoints/:id        Super Admin
 */
interface RawList {
  items: GlobalEndpoint[];
  meta: { page: number; limit: number; total: number };
}

export async function getGlobalEndpoints(page = 1, limit = 20): Promise<GlobalEndpointListResult> {
  const response = await apiClient.get<ApiSuccessResponse<RawList>>("/global-endpoints", { page, limit });
  const { items, meta } = response.data;
  return { items, page: meta.page, limit: meta.limit, total: meta.total };
}

export async function getAvailableGlobalEndpoints(): Promise<GlobalEndpoint[]> {
  const response = await apiClient.get<ApiSuccessResponse<GlobalEndpoint[]>>("/global-endpoints/available");
  return response.data;
}

export async function createGlobalEndpoint(input: GlobalEndpointInput): Promise<GlobalEndpoint> {
  const response = await apiClient.post<ApiSuccessResponse<GlobalEndpoint>>("/global-endpoints", input);
  return response.data;
}

export async function updateGlobalEndpoint(
  id: string,
  input: Partial<Omit<GlobalEndpointInput, "name">> & { status?: "ACTIVE" | "INACTIVE" },
): Promise<GlobalEndpoint> {
  const response = await apiClient.patch<ApiSuccessResponse<GlobalEndpoint>>(`/global-endpoints/${encodeURIComponent(id)}`, input);
  return response.data;
}

export async function deleteGlobalEndpoint(id: string): Promise<void> {
  await apiClient.delete<ApiSuccessResponse<null>>(`/global-endpoints/${encodeURIComponent(id)}`);
}
