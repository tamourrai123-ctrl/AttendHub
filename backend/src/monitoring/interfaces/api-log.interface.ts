export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** Shaped to match the frontend's `ApiLog` type (src/types/apiLog.ts). */
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
