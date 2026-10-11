import { MOCK_LEAVE_RECORDS } from "../mock/leave";
import type { LeaveRecord } from "../types/leave";
import { cloneSeed, delay } from "./serviceUtils";

const records: LeaveRecord[] = cloneSeed(MOCK_LEAVE_RECORDS);

const NETWORK_DELAY_MS = 400;

export async function getCompanyLeave(
  companyId: string,
): Promise<LeaveRecord[]> {
  await delay(NETWORK_DELAY_MS);

  return records
    .filter((record) => record.companyId === companyId)
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName));
}
