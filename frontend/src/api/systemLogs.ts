import { apiClient, type ApiSuccessResponse } from "./client";
import type { SystemLogDetail } from "../types/systemLog";

/**
 * Real System Logs API. Talks to the actual backend routes in
 * backend/src/system-logs/system-logs.controller.ts:
 *   GET /system-logs        (Super Admin only — query: page, limit)
 *   GET /system-logs/:id    (Super Admin only)
 *   GET /system-logs/mine   (Company Admin only — query: page, limit;
 *                            Phase 2/Part C follow-up, backs the Dashboard's
 *                            Recent Activity panel)
 *
 * This module is a drop-in replacement for the old
 * services/mockSystemLogService.ts — the System Logs page depends only on
 * these exported function signatures, never on how they're implemented.
 *
 * Same constraint as api/companies.ts: the backend does NOT support
 * server-side search, severity, or resource-type filtering on the list
 * endpoint — only `page`/`limit` are real (confirmed against
 * system-logs.controller.ts, which passes PaginationQueryDto straight
 * through with no extension). Do not add those params here; the page-level
 * UI removes the filter controls entirely rather than faking them against
 * a single loaded page, for the same reason Companies.tsx does.
 */

interface RawSystemLogListData {
  items: SystemLogDetail[];
  meta: { page: number; limit: number; total: number };
}

export interface SystemLogListQuery {
  page?: number;
  limit?: number;
}

export interface SystemLogListResult {
  items: SystemLogDetail[];
  page: number;
  limit: number;
  total: number;
}

export async function getSystemLogs(query: SystemLogListQuery = {}): Promise<SystemLogListResult> {
  const response = await apiClient.get<ApiSuccessResponse<RawSystemLogListData>>("/system-logs", {
    page: query.page,
    limit: query.limit,
  });
  const { items, meta } = response.data;
  return { items, page: meta.page, limit: meta.limit, total: meta.total };
}

export async function getSystemLogById(id: string): Promise<SystemLogDetail> {
  const response = await apiClient.get<ApiSuccessResponse<SystemLogDetail>>(`/system-logs/${encodeURIComponent(id)}`);
  return response.data;
}

/**
 * Company Admin's own recent-activity feed (Phase 2/Part C follow-up) —
 * used by the Dashboard's Recent Activity panel. Always scoped server-side
 * to the caller's own company; there is no companyId param to pass here.
 * Returns just the entries (no pagination controls on the Dashboard), newest
 * first, capped at `limit`.
 */
export async function getMyRecentActivity(limit = 10): Promise<SystemLogDetail[]> {
  const response = await apiClient.get<ApiSuccessResponse<RawSystemLogListData>>("/system-logs/mine", { page: 1, limit });
  return response.data.items;
}
