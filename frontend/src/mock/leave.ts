import type { LeaveRecord } from "../types/leave";

/**
 * MOCK DATA — development only. Seed data for `mockLeaveService`.
 *
 * Company Admin can only ever VIEW leave here — requesting/approving leave
 * is handled by the AttendHub mobile app, not this web panel.
 */
export const MOCK_LEAVE_RECORDS: LeaveRecord[] = [
  { id: "lv_001", employeeId: "emp_004", employeeName: "Sara Malik", companyId: "cmp_001", leaveType: "Sick Leave", startDate: "2026-09-07", endDate: "2026-09-08", status: "APPROVED" },
  { id: "lv_002", employeeId: "emp_003", employeeName: "Ahmed Raza", companyId: "cmp_001", leaveType: "Casual Leave", startDate: "2026-09-15", endDate: "2026-09-15", status: "PENDING" },
  { id: "lv_003", employeeId: "emp_002", employeeName: "Fatima Noor", companyId: "cmp_001", leaveType: "Annual Leave", startDate: "2026-09-20", endDate: "2026-09-24", status: "PENDING" },
  { id: "lv_004", employeeId: "emp_001", employeeName: "John Carter", companyId: "cmp_001", leaveType: "Casual Leave", startDate: "2026-09-11", endDate: "2026-09-11", status: "APPROVED" },
  { id: "lv_005", employeeId: "emp_007", employeeName: "Hamza Iqbal", companyId: "cmp_001", leaveType: "Sick Leave", startDate: "2026-08-28", endDate: "2026-08-29", status: "REJECTED" },

  // XYZ Ltd (cmp_002) — must never surface for the ABC Pvt Ltd Company Admin.
  { id: "lv_101", employeeId: "emp_101", employeeName: "Nida Farooq", companyId: "cmp_002", leaveType: "Annual Leave", startDate: "2026-09-12", endDate: "2026-09-16", status: "PENDING" },
];
