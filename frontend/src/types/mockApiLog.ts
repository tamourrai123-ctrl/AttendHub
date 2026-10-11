/**
 * MOCK-ERA shape — kept only for services/mockApiMonitoringService.ts and
 * mock/apiLogs.ts, still used by the Dashboard's "API Activity" panel
 * (openly labeled "(mock)" there — see Dashboard.tsx).
 *
 * The real API Monitoring screen (pages/control/ApiMonitoring.tsx) now
 * talks to api/monitoring.ts instead and uses the real `ApiLog` type from
 * types/apiLog.ts, which no longer carries `companyName` or captured
 * headers/bodies — the real MonitoringInterceptor never records those (see
 * that type's own doc comment). Kept separate so this mock data can keep
 * its fuller, fake shape without the real type having to carry it.
 */
export type MockHttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface MockApiLog {
  id: string;
  requestId: string;
  timestamp: string;
  companyId: string;
  companyName: string;
  endpoint: string;
  method: MockHttpMethod;
  statusCode: number;
  responseTimeMs: number;
  requestHeaders: Record<string, string>;
  queryParams: Record<string, string>;
  requestBody: unknown;
  responseHeaders: Record<string, string>;
  responseBody: unknown;
}
