import { apiClient, type ApiSuccessResponse } from "./client";
import type { AttendanceListQuery, AttendanceListResult, AttendanceRecord } from "../types/attendance";

/**
 * Real Attendance API (Phase 2/Part C) — replaces services/mockAttendanceService.ts.
 * Talks to backend/src/attendance/attendance.controller.ts:
 *   GET /attendance      (Company Admin — query: employeeId, date, startDate,
 *                          endDate, status, search, page, limit)
 *   GET /attendance/me   (Employee — same query shape; employeeId is ignored
 *                          server-side, always taken from the session)
 *
 * The backend fetches this LIVE from the company's connected HR system on
 * every call (see backend's HrLiveFetchService) — AttendHub never stores an
 * attendance record of its own. companyId is resolved from the JWT session
 * server-side, so it is never sent from here.
 */

interface RawAttendanceListData {
  items: AttendanceRecord[];
  meta: { page: number; limit: number; total: number };
}

function toParams(query: AttendanceListQuery) {
  const { search, status, date, page = 1, pageSize = 10 } = query;
  return {
    search,
    status: status && status !== "ALL" ? status : undefined,
    date,
    page,
    limit: pageSize,
  };
}

/** Company Admin view — always scoped server-side to their own company. */
export async function getCompanyAttendance(query: AttendanceListQuery = {}): Promise<AttendanceListResult> {
  const response = await apiClient.get<ApiSuccessResponse<RawAttendanceListData>>("/attendance", toParams(query));
  const { items, meta } = response.data;
  return { items, total: meta.total, page: meta.page, pageSize: meta.limit };
}

/** Employee self-service view — always scoped server-side to the logged-in employee. */
export async function getMyAttendance(query: AttendanceListQuery = {}): Promise<AttendanceListResult> {
  const response = await apiClient.get<ApiSuccessResponse<RawAttendanceListData>>("/attendance/me", toParams(query));
  const { items, meta } = response.data;
  return { items, total: meta.total, page: meta.page, pageSize: meta.limit };
}
