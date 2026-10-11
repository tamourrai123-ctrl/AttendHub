import { apiClient, type ApiSuccessResponse } from "./client";
import type { LeaveListQuery, LeaveListResult, LeaveRecord } from "../types/leave";

/**
 * Real Leave API (Phase 2/Part C) — replaces services/mockLeaveService.ts.
 * Talks to backend/src/leave/leave.controller.ts:
 *   GET /leave   (Company Admin only, query: employeeId, leaveType, search, page, limit)
 *
 * The backend fetches this LIVE from the company's connected HR system on
 * every call — AttendHub never stores a leave record of its own. This is
 * now a leave-BALANCE view (entitled/consumed/available days + a current
 * status per employee/leave-type), not the old request/approval list — see
 * types/leave.ts. companyId is resolved from the JWT session server-side.
 */

interface RawLeaveListData {
  items: LeaveRecord[];
  meta: { page: number; limit: number; total: number };
}

/** Always scoped server-side to the caller's own company. */
export async function getCompanyLeave(query: LeaveListQuery = {}): Promise<LeaveListResult> {
  const { employeeId, leaveType, search, page = 1, pageSize = 20 } = query;
  const response = await apiClient.get<ApiSuccessResponse<RawLeaveListData>>("/leave", {
    employeeId,
    leaveType,
    search,
    page,
    limit: pageSize,
  });
  const { items, meta } = response.data;
  return { items, total: meta.total, page: meta.page, pageSize: meta.limit };
}
