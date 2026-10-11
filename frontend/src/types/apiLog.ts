/**
 * Matches the real backend's ApiLog shape exactly — see
 * backend/src/monitoring/interfaces/api-log.interface.ts, whose own
 * comment says it's "shaped to match the frontend's ApiLog type".
 *
 * The pre-migration mock fields (`companyName`, and the whole
 * `ApiLogDetail` extension with requestHeaders/queryParams/requestBody/
 * responseHeaders/responseBody) have been removed: the real
 * MonitoringInterceptor never captures headers or bodies at all — only
 * method/endpoint/statusCode/responseTimeMs plus userId/companyId when the
 * request was authenticated (see monitoring.interceptor.ts's doc comment).
 * `companyId` and `userId` are optional because plenty of real requests
 * aren't tied to either (e.g. login, or an unauthenticated request).
 */
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type ApiLogStatusGroup = "2xx" | "4xx" | "5xx";

export interface ApiLog {
  id: string;
  requestId: string;
  /** ISO timestamp */
  timestamp: string;
  companyId?: string;
  userId?: string;
  endpoint: string;
  method: HttpMethod;
  statusCode: number;
  responseTimeMs: number;
}

export interface ApiMonitoringSummary {
  requestsToday: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTimeMs: number;
}

export interface ApiLogListQuery {
  page?: number;
  limit?: number;
}

export interface ApiLogListResult {
  items: ApiLog[];
  page: number;
  limit: number;
  total: number;
}

export function statusGroupOf(statusCode: number): ApiLogStatusGroup {
  if (statusCode >= 500) return "5xx";
  if (statusCode >= 400) return "4xx";
  return "2xx";
}
