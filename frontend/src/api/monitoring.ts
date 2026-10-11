import { apiClient, type ApiSuccessResponse } from "./client";
import type { ApiLog, ApiLogListQuery, ApiLogListResult, ApiMonitoringSummary } from "../types/apiLog";

/**
 * Real API Monitoring API. Talks to the actual backend routes in
 * backend/src/monitoring/monitoring.controller.ts (both `@Roles(Role.SUPER_ADMIN)`):
 *   GET /monitoring          (query: page, limit)
 *   GET /monitoring/summary
 *
 * Every request the backend serves is logged automatically by a global
 * interceptor (MonitoringInterceptor) — this data has been real and live
 * since the backend was first built, it just wasn't wired to this screen
 * yet. Same constraint as every other list endpoint in this app: only
 * `page`/`limit` are real on the list route, no server-side search or
 * filtering.
 */

interface RawApiLogListData {
  items: ApiLog[];
  meta: { page: number; limit: number; total: number };
}

export async function getApiLogs(query: ApiLogListQuery = {}): Promise<ApiLogListResult> {
  const response = await apiClient.get<ApiSuccessResponse<RawApiLogListData>>("/monitoring", {
    page: query.page,
    limit: query.limit,
  });
  const { items, meta } = response.data;
  return { items, page: meta.page, limit: meta.limit, total: meta.total };
}

export async function getApiMonitoringSummary(): Promise<ApiMonitoringSummary> {
  const response = await apiClient.get<ApiSuccessResponse<ApiMonitoringSummary>>("/monitoring/summary");
  return response.data;
}
