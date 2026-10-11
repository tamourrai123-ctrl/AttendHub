import { MOCK_LEAVE_RECORDS } from "../mock/leave";
import type { LeaveRecord } from "../types/leave";
import { cloneSeed, delay } from "./serviceUtils";

/**
 * Mock data layer for Company Admin leave viewing. Deliberately read-only —
 * leave is requested and managed through the AttendHub mobile app, not
 * here, so this module has no create/update/delete.
 */
const records: LeaveRecord[] = cloneSeed(MOCK_LEAVE_RECORDS);

const NETWORK_DELAY_MS = 400;

/** Always scoped to the caller's own company. */
export async function getCompanyLeave(companyId: string): Promise<LeaveRecord[]> {
  await delay(NETWORK_DELAY_MS);
  return records
    .filter((r) => r.companyId === companyId)
    .sort((a, b) => (a.startDate < b.startDate ? 1 : -1));
}
