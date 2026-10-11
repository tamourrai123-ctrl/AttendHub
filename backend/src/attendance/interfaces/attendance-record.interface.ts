/**
 * Mirrors the frontend's `AttendanceRecord` type (src/types/attendance.ts).
 * This is data AttendHub RECEIVES from the connected HR system — there is
 * deliberately no check-in/check-out mutation anywhere near this type (see
 * AttendanceService/AttendanceController: read-only, GET-only).
 */
export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'HALF_DAY' | 'ON_LEAVE';

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  companyId: string;
  /** YYYY-MM-DD */
  date: string;
  status: AttendanceStatus;
  checkInAt: string | null;
  checkOutAt: string | null;
  workingHours: string | null;
}
