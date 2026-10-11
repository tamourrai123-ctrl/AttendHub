/**
 * Attendance domain types (Phase 3).
 *
 * Attendance is treated as data AttendHub receives FROM the connected HR
 * system, not something recorded through this app — there is no
 * check-in/check-out mutation anywhere in this type or its service. Company
 * Admins view attendance scoped to their own company; Employees view only
 * their own records. Field names are kept flexible/optional (`checkInAt`,
 * `checkOutAt`, `workingHours`) since a real HR provider may not return all
 * of them for every record.
 */

export type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE" | "HALF_DAY" | "ON_LEAVE";

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  companyId: string;
  /** YYYY-MM-DD */
  date: string;
  status: AttendanceStatus;
  /** ISO timestamp, or null if not recorded for this status (e.g. absent) */
  checkInAt: string | null;
  /** ISO timestamp, or null if not recorded */
  checkOutAt: string | null;
  /** Pre-formatted (e.g. "8h 12m"), or null when it can't be derived */
  workingHours: string | null;
}

export interface AttendanceListQuery {
  companyId?: string;
  employeeId?: string;
  search?: string;
  status?: AttendanceStatus | "ALL";
  /** Exact YYYY-MM-DD filter */
  date?: string;
  page?: number;
  pageSize?: number;
}

export interface AttendanceListResult {
  items: AttendanceRecord[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AttendanceSummary {
  present: number;
  absent: number;
  late: number;
  halfDay: number;
  onLeave: number;
  total: number;
}

export interface DailyAttendanceReportRow {
  date: string;
  present: number;
  absent: number;
  late: number;
  halfDay: number;
  onLeave: number;
}

export interface EmployeeAttendanceReportRow {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  presentDays: number;
  absentDays: number;
  lateDays: number;
  /** Present + late + half-day days, over total days with a record, as a whole-number percentage. */
  attendanceRate: number;
}

export interface CompanyAttendanceReport {
  rangeLabel: string;
  totals: AttendanceSummary;
  byDate: DailyAttendanceReportRow[];
  byEmployee: EmployeeAttendanceReportRow[];
}

/** One bar in the attendance overview chart (Dashboard / AttendanceChart). */
export interface DailyAttendancePoint {
  day: string;
  present: number;
  absent: number;
}
