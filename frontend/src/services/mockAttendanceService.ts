import { MOCK_ATTENDANCE_RECORDS } from "../mock/attendanceRecords";
import type {
  AttendanceListQuery,
  AttendanceListResult,
  AttendanceRecord,
  AttendanceSummary,
  CompanyAttendanceReport,
} from "../types/attendance";
import { cloneSeed, delay } from "./serviceUtils";

/**
 * Mock data layer for attendance. AttendHub only ever DISPLAYS attendance
 * here — there is no create/update/delete in this module, matching the
 * product rule that attendance is sourced from the connected HR system, not
 * recorded through this app.
 *
 * MULTI-TENANT / SELF-SCOPE RULE: `getCompanyAttendance*` always filters by
 * `companyId` (Company Admin can only ever see their own company), and
 * `getMyAttendance`/`getMyTodayAttendance` always filter by `employeeId`
 * only — there is deliberately no function that lets a caller pass an
 * arbitrary employee id to read someone else's records from the Employee
 * panel's side of this service.
 */
const records: AttendanceRecord[] = cloneSeed(MOCK_ATTENDANCE_RECORDS);

const NETWORK_DELAY_MS = 400;

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function filterAndSort(scoped: AttendanceRecord[], query: AttendanceListQuery): AttendanceRecord[] {
  const { search = "", status = "ALL", date } = query;

  const filtered = scoped.filter((r) => {
    const matchesSearch =
      !search || normalize(r.employeeName).includes(normalize(search)) || normalize(r.employeeCode).includes(normalize(search));
    const matchesStatus = status === "ALL" || r.status === status;
    const matchesDate = !date || r.date === date;
    return matchesSearch && matchesStatus && matchesDate;
  });

  return [...filtered].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.employeeName.localeCompare(b.employeeName)));
}

function paginate(items: AttendanceRecord[], page: number, pageSize: number): AttendanceListResult {
  const total = items.length;
  const start = (page - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), total, page, pageSize };
}

/** Company Admin view — always scoped to their own company. */
export async function getCompanyAttendance(companyId: string, query: AttendanceListQuery = {}): Promise<AttendanceListResult> {
  await delay(NETWORK_DELAY_MS);
  const { employeeId, page = 1, pageSize = 10 } = query;

  let scoped = records.filter((r) => r.companyId === companyId);
  if (employeeId) scoped = scoped.filter((r) => r.employeeId === employeeId);

  return paginate(filterAndSort(scoped, query), page, pageSize);
}

/** Employee self-service view — always scoped to the logged-in employee, never any other id. */
export async function getMyAttendance(employeeId: string, query: AttendanceListQuery = {}): Promise<AttendanceListResult> {
  await delay(NETWORK_DELAY_MS);
  const { page = 1, pageSize = 20 } = query;

  const scoped = records.filter((r) => r.employeeId === employeeId);
  return paginate(filterAndSort(scoped, query), page, pageSize);
}

export async function getMyTodayAttendance(employeeId: string): Promise<AttendanceRecord | undefined> {
  await delay(NETWORK_DELAY_MS);
  return records.find((r) => r.employeeId === employeeId && r.date === todayIso());
}

export async function getCompanyAttendanceSummary(companyId: string, date: string = todayIso()): Promise<AttendanceSummary> {
  await delay(NETWORK_DELAY_MS);
  const scoped = records.filter((r) => r.companyId === companyId && r.date === date);

  return {
    present: scoped.filter((r) => r.status === "PRESENT").length,
    absent: scoped.filter((r) => r.status === "ABSENT").length,
    late: scoped.filter((r) => r.status === "LATE").length,
    halfDay: scoped.filter((r) => r.status === "HALF_DAY").length,
    onLeave: scoped.filter((r) => r.status === "ON_LEAVE").length,
    total: scoped.length,
  };
}

/**
 * Aggregates every attendance record on file for this company into a
 * by-date and by-employee breakdown. Kept intentionally simple (no charting
 * library, no date-range picker) per the "don't overbuild reports" brief.
 */
export async function getCompanyAttendanceReport(companyId: string): Promise<CompanyAttendanceReport> {
  await delay(NETWORK_DELAY_MS);
  const scoped = records.filter((r) => r.companyId === companyId);

  const totals: AttendanceSummary = {
    present: scoped.filter((r) => r.status === "PRESENT").length,
    absent: scoped.filter((r) => r.status === "ABSENT").length,
    late: scoped.filter((r) => r.status === "LATE").length,
    halfDay: scoped.filter((r) => r.status === "HALF_DAY").length,
    onLeave: scoped.filter((r) => r.status === "ON_LEAVE").length,
    total: scoped.length,
  };

  const byDateMap = new Map<string, CompanyAttendanceReport["byDate"][number]>();
  for (const r of scoped) {
    const row = byDateMap.get(r.date) ?? { date: r.date, present: 0, absent: 0, late: 0, halfDay: 0, onLeave: 0 };
    if (r.status === "PRESENT") row.present += 1;
    else if (r.status === "ABSENT") row.absent += 1;
    else if (r.status === "LATE") row.late += 1;
    else if (r.status === "HALF_DAY") row.halfDay += 1;
    else if (r.status === "ON_LEAVE") row.onLeave += 1;
    byDateMap.set(r.date, row);
  }
  const byDate = [...byDateMap.values()].sort((a, b) => (a.date < b.date ? 1 : -1));

  const byEmployeeMap = new Map<string, CompanyAttendanceReport["byEmployee"][number] & { recordedDays: number }>();
  for (const r of scoped) {
    const row =
      byEmployeeMap.get(r.employeeId) ??
      { employeeId: r.employeeId, employeeCode: r.employeeCode, employeeName: r.employeeName, presentDays: 0, absentDays: 0, lateDays: 0, attendanceRate: 0, recordedDays: 0 };
    row.recordedDays += 1;
    if (r.status === "PRESENT" || r.status === "LATE" || r.status === "HALF_DAY") row.presentDays += 1;
    if (r.status === "ABSENT") row.absentDays += 1;
    if (r.status === "LATE") row.lateDays += 1;
    byEmployeeMap.set(r.employeeId, row);
  }
  const byEmployee = [...byEmployeeMap.values()]
    .map((row) => ({
      employeeId: row.employeeId,
      employeeCode: row.employeeCode,
      employeeName: row.employeeName,
      presentDays: row.presentDays,
      absentDays: row.absentDays,
      lateDays: row.lateDays,
      attendanceRate: row.recordedDays === 0 ? 0 : Math.round((row.presentDays / row.recordedDays) * 100),
    }))
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName));

  const days = byDate.length;
  const rangeLabel = days <= 1 ? "Last day on file" : `Last ${days} days on file`;

  return { rangeLabel, totals, byDate, byEmployee };
}
