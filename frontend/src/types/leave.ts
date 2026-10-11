/**
 * Leave domain types (Phase 2/Part C).
 *
 * Redesigned from a request/approval model (Pending/Approved/Rejected, one
 * row per leave request) to a live leave-BALANCE-summary model, to match
 * what the real HR system's "Leave Report" endpoint actually returns per
 * employee/leave-type — entitled/consumed/available days plus a current
 * status. Leave itself is still requested/managed entirely through the
 * AttendHub mobile app; this only ever displays a live read of the
 * employee's current balance, fetched fresh from the backend on every
 * call — there is no local leave storage anywhere in this app.
 *
 * `leaveStatus` is a plain string, not a fixed union: it is whatever the
 * connected HR system reports, in its own vocabulary, so there is no fixed
 * color/label mapping for it (see lib/statusBadges.ts) — it's rendered as
 * plain text / a neutral badge instead.
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

export interface LeaveListQuery {
  employeeId?: string;
  leaveType?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface LeaveListResult {
  items: LeaveRecord[];
  total: number;
  page: number;
  pageSize: number;
}
