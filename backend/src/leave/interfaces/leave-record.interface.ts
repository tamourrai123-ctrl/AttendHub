/**
 * Mirrors the frontend's `LeaveRecord` type (src/types/leave.ts).
 *
 * Phase 2/Part C — redesigned from a request/approval model
 * (PENDING/APPROVED/REJECTED, one row per leave request) to a live
 * leave-BALANCE-summary model, to match what the real HR system's "Leave
 * Report" endpoint actually returns per employee/leave-type: entitled,
 * consumed, and available days, plus a current status. Leave itself is
 * still requested/managed entirely through the AttendHub mobile app — this
 * is a live, read-only view of the employee's current balance, fetched
 * fresh from HR on every call (see LeaveService) — nothing here is ever
 * stored in AttendHub's own database.
 *
 * `leaveStatus` is a plain string, not a fixed AttendHub-defined enum: it
 * is whatever the connected HR system reports in its own vocabulary, so
 * there is no fixed status -> color mapping for it on the frontend (unlike
 * AttendanceStatus, which IS one of AttendHub's own fixed 5 values).
 */
export interface LeaveRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  companyId: string;
  leaveType: string;
  totalLeaveDays: number;
  entitledLeave: number;
  consumedLeave: number;
  availableLeaveBalance: number;
  leaveStatus: string;
}
