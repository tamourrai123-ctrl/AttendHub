import { MOCK_SYSTEM_LOGS } from "../mock/systemLogs";
import type { SystemLogDetail } from "../types/systemLog";
import { cloneSeed, delay } from "./serviceUtils";

const systemLogs: SystemLogDetail[] = cloneSeed(MOCK_SYSTEM_LOGS);

const NETWORK_DELAY_MS = 400;

export async function getSystemLogs(): Promise<SystemLogDetail[]> {
  await delay(NETWORK_DELAY_MS);
  return [...systemLogs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

export async function getSystemLogById(id: string): Promise<SystemLogDetail | undefined> {
  await delay(NETWORK_DELAY_MS);
  return systemLogs.find((log) => log.id === id);
}
