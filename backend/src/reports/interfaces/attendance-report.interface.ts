/** Shaped to match the frontend's CompanyAttendanceReport/AttendanceSummary types (src/types/attendance.ts). */
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
