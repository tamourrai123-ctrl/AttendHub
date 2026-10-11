import { MOCK_API_LOGS } from "../mock/apiLogs";
import type { MockApiLog } from "../types/mockApiLog";
import type { ApiMonitoringSummary } from "../types/apiLog";
import { cloneSeed, delay } from "./serviceUtils";

/**
 * Still mock-driven on purpose: the Dashboard's "API Activity" panel
 * (openly labeled "(mock)" there) and CompanyDetailsDrawer's "API Requests"
 * count both still use this. The real API Monitoring screen
 * (pages/control/ApiMonitoring.tsx) talks to api/monitoring.ts instead,
 * which is backed by requests the backend actually serves (see
 * MonitoringInterceptor) — not this fake per-request data.
 */
const apiLogs: MockApiLog[] = cloneSeed(MOCK_API_LOGS);

const NETWORK_DELAY_MS = 400;

/** Returns the full mock log list; consumers filter/search client-side. */
export async function getApiLogs(): Promise<MockApiLog[]> {
  await delay(NETWORK_DELAY_MS);
  return [...apiLogs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

export async function getApiLogById(id: string): Promise<MockApiLog | undefined> {
  await delay(NETWORK_DELAY_MS);
  return apiLogs.find((log) => log.id === id);
}

/**
 * Aggregated from the mock log dataset (never hard-coded into the
 * Dashboard JSX) so the numbers always agree with each other.
 */
export async function getApiMonitoringSummary(): Promise<ApiMonitoringSummary> {
  await delay(NETWORK_DELAY_MS);

  const requestsToday = apiLogs.length;
  const failedRequests = apiLogs.filter((log) => log.statusCode >= 400).length;
  const successfulRequests = requestsToday - failedRequests;
  const averageResponseTimeMs = Math.round(
    apiLogs.reduce((sum, log) => sum + log.responseTimeMs, 0) / Math.max(1, requestsToday)
  );

  return { requestsToday, successfulRequests, failedRequests, averageResponseTimeMs };
}
