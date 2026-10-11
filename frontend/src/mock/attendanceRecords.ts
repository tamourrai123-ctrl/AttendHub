import type { AttendanceRecord, AttendanceStatus } from "../types/attendance";

/**
 * MOCK DATA — development only. Seed data for `mockAttendanceService`.
 *
 * This is the single source of truth for attendance: the Company Admin's
 * `/company/attendance` (filtered by companyId), the Company Dashboard/
 * Reports (aggregated from the same rows), and the Employee's own
 * `/user/attendance` (filtered by employeeId) all read from this one array
 * through the service layer — never two separate datasets that could drift
 * apart. Nothing here represents a real check-in: it stands in for what the
 * connected HR system would eventually report.
 */

const NOW = new Date("2026-09-11T09:00:00Z");

function dateOnly(dayOffset: number): string {
  const d = new Date(NOW);
  d.setUTCDate(d.getUTCDate() - dayOffset);
  return d.toISOString().slice(0, 10);
}

function isoAt(dayOffset: number, hhmm: string | null): string | null {
  if (hhmm === null) return null;
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(NOW);
  d.setUTCDate(d.getUTCDate() - dayOffset);
  d.setUTCHours(h, m, 0, 0);
  return d.toISOString();
}

function computeWorkingHours(checkInAt: string | null, checkOutAt: string | null): string | null {
  if (!checkInAt || !checkOutAt) return null;
  const ms = new Date(checkOutAt).getTime() - new Date(checkInAt).getTime();
  if (ms <= 0) return null;
  const totalMinutes = Math.round(ms / 60_000);
  return `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;
}

interface EmployeeIdentity {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  companyId: string;
}

/** [days ago, status, check-in "HH:mm" | null, check-out "HH:mm" | null] */
type DayRecord = [number, AttendanceStatus, string | null, string | null];

let sequence = 0;
function nextId(): string {
  sequence += 1;
  return `att_${String(sequence).padStart(3, "0")}`;
}

function buildRecords(employee: EmployeeIdentity, days: DayRecord[]): AttendanceRecord[] {
  return days.map(([dayOffset, status, checkIn, checkOut]) => {
    const checkInAt = isoAt(dayOffset, checkIn);
    const checkOutAt = isoAt(dayOffset, checkOut);
    return {
      id: nextId(),
      employeeId: employee.employeeId,
      employeeCode: employee.employeeCode,
      employeeName: employee.employeeName,
      companyId: employee.companyId,
      date: dateOnly(dayOffset),
      status,
      checkInAt,
      checkOutAt,
      workingHours: computeWorkingHours(checkInAt, checkOutAt),
    };
  });
}

// Last 5 days (today = 0) for every ABC Pvt Ltd (cmp_001) employee.
export const MOCK_ATTENDANCE_RECORDS: AttendanceRecord[] = [
  ...buildRecords(
    { employeeId: "emp_001", employeeCode: "EMP-1001", employeeName: "John Carter", companyId: "cmp_001" },
    [
      [0, "PRESENT", "09:02", "18:05"],
      [1, "LATE", "09:41", "18:10"],
      [2, "PRESENT", "08:58", "17:58"],
      [3, "ON_LEAVE", null, null],
      [4, "PRESENT", "09:00", "18:02"],
    ]
  ),
  ...buildRecords(
    { employeeId: "emp_002", employeeCode: "EMP-1002", employeeName: "Fatima Noor", companyId: "cmp_001" },
    [
      [0, "LATE", "09:41", "18:12"],
      [1, "PRESENT", "08:55", "18:00"],
      [2, "PRESENT", "09:03", "18:04"],
      [3, "PRESENT", "08:59", "17:55"],
      [4, "HALF_DAY", "09:00", "13:00"],
    ]
  ),
  ...buildRecords(
    { employeeId: "emp_003", employeeCode: "EMP-1003", employeeName: "Ahmed Raza", companyId: "cmp_001" },
    [
      [0, "ABSENT", null, null],
      [1, "PRESENT", "09:01", "18:01"],
      [2, "PRESENT", "08:57", "17:59"],
      [3, "PRESENT", "09:00", "18:00"],
      [4, "ABSENT", null, null],
    ]
  ),
  ...buildRecords(
    { employeeId: "emp_004", employeeCode: "EMP-1004", employeeName: "Sara Malik", companyId: "cmp_001" },
    [
      [0, "ON_LEAVE", null, null],
      [1, "ON_LEAVE", null, null],
      [2, "PRESENT", "09:05", "18:00"],
      [3, "PRESENT", "08:58", "17:57"],
      [4, "PRESENT", "09:02", "18:03"],
    ]
  ),
  ...buildRecords(
    { employeeId: "emp_005", employeeCode: "EMP-1005", employeeName: "Usman Tariq", companyId: "cmp_001" },
    [
      [0, "PRESENT", "08:55", "18:00"],
      [1, "PRESENT", "08:59", "18:02"],
      [2, "LATE", "09:35", "18:08"],
      [3, "PRESENT", "09:00", "18:00"],
      [4, "PRESENT", "08:57", "17:59"],
    ]
  ),
  ...buildRecords(
    { employeeId: "emp_006", employeeCode: "EMP-1006", employeeName: "Zara Sheikh", companyId: "cmp_001" },
    [
      [0, "PRESENT", "09:00", "18:00"],
      [1, "HALF_DAY", "09:00", "13:15"],
      [2, "PRESENT", "08:59", "17:58"],
      [3, "PRESENT", "09:01", "18:01"],
      [4, "PRESENT", "09:00", "18:00"],
    ]
  ),
  ...buildRecords(
    { employeeId: "emp_007", employeeCode: "EMP-1007", employeeName: "Hamza Iqbal", companyId: "cmp_001" },
    [
      [0, "PRESENT", "08:50", "17:55"],
      [1, "PRESENT", "08:52", "17:57"],
      [2, "ABSENT", null, null],
      [3, "PRESENT", "08:58", "18:00"],
      [4, "PRESENT", "08:55", "17:59"],
    ]
  ),
  // Inactive employee — still has historical attendance on file.
  ...buildRecords(
    { employeeId: "emp_008", employeeCode: "EMP-1008", employeeName: "Mahnoor Aslam", companyId: "cmp_001" },
    [
      [4, "PRESENT", "09:00", "18:00"],
      [5, "PRESENT", "09:01", "18:00"],
    ]
  ),

  // XYZ Ltd (cmp_002) — must never surface for the ABC Pvt Ltd Company Admin
  // or Employee. Exists to prove the service's tenant filter actually works.
  ...buildRecords(
    { employeeId: "emp_101", employeeCode: "EMP-2001", employeeName: "Nida Farooq", companyId: "cmp_002" },
    [
      [0, "PRESENT", "09:00", "18:00"],
      [1, "PRESENT", "09:00", "18:00"],
    ]
  ),
  ...buildRecords(
    { employeeId: "emp_102", employeeCode: "EMP-2002", employeeName: "Owais Anwar", companyId: "cmp_002" },
    [[0, "LATE", "09:45", "18:05"]]
  ),
];
