import { apiClient, type ApiSuccessResponse } from "./client";
import type { CompanyAttendanceReport } from "../types/attendance";

/**
 * Real Reports API (Phase 2/Part C follow-up) — replaces the Dashboard's and
 * Reports page's use of services/mockAttendanceService's
 * getCompanyAttendanceReport(). Talks to backend/src/reports/reports.controller.ts:
 *   GET /reports/attendance   (Company Admin — query: startDate, endDate, employeeId)
 *
 * The backend now aggregates this from a LIVE HR fetch on every call (see
 * AttendanceService/HrLiveFetchService) rather than an in-memory mock
 * repository — the response shape (CompanyAttendanceReport) is unchanged,
 * so callers don't need to change how they read the result.
 */
export interface AttendanceReportQuery {
  startDate?: string;
  endDate?: string;
  employeeId?: string;
}

export async function getAttendanceReport(query: AttendanceReportQuery = {}): Promise<CompanyAttendanceReport> {
  const response = await apiClient.get<ApiSuccessResponse<CompanyAttendanceReport>>("/reports/attendance", {
    startDate: query.startDate,
    endDate: query.endDate,
    employeeId: query.employeeId,
  });
  return response.data;
}
