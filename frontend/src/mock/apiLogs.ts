import type { MockApiLog, MockHttpMethod } from "../types/mockApiLog";

/**
 * MOCK DATA — development only. Seed data for `mockApiMonitoringService`,
 * still used by the Dashboard's "API Activity" panel only (see that
 * panel's own "(mock)" label). The real, live version of this data is now
 * served by api/monitoring.ts on the API Monitoring screen instead.
 *
 * Represents requests the (nonexistent) integration engine would have made
 * to company HR systems. Nothing here is a real network call or a real
 * credential — the `Authorization` header value below is a hardcoded mock
 * string, not a captured secret, and is still masked in the UI on principle.
 */

interface LogSeed {
  id: string;
  minutesAgo: number;
  companyId: string;
  companyName: string;
  endpoint: string;
  method: MockHttpMethod;
  statusCode: number;
  responseTimeMs: number;
}

const NOW = new Date("2026-09-11T10:55:00Z").getTime();

function isoMinutesAgo(minutesAgo: number): string {
  return new Date(NOW - minutesAgo * 60_000).toISOString();
}

function buildLog(seed: LogSeed): MockApiLog {
  const success = seed.statusCode < 400;
  return {
    id: seed.id,
    requestId: `req_${seed.id.slice(4)}${seed.statusCode}`,
    timestamp: isoMinutesAgo(seed.minutesAgo),
    companyId: seed.companyId,
    companyName: seed.companyName,
    endpoint: seed.endpoint,
    method: seed.method,
    statusCode: seed.statusCode,
    responseTimeMs: seed.responseTimeMs,
    requestHeaders: {
      "Content-Type": "application/json",
      Authorization: "Bearer ••••••••",
      "X-Tamotam-Integration": seed.companyId,
    },
    queryParams: seed.method === "GET" ? { page: "1", pageSize: "50" } : {},
    requestBody:
      seed.method === "GET" || seed.method === "DELETE"
        ? null
        : { employeeId: "EMP-2291", event: seed.endpoint.includes("check") ? "check-in" : "sync", source: "tamotam-engine" },
    responseHeaders: { "Content-Type": "application/json", "X-Request-Id": `req_${seed.id.slice(4)}${seed.statusCode}` },
    responseBody: success
      ? { status: "ok", recordsProcessed: Math.max(1, Math.round(seed.responseTimeMs / 20)) }
      : { status: "error", message: httpErrorMessage(seed.statusCode) },
  };
}

function httpErrorMessage(statusCode: number): string {
  switch (statusCode) {
    case 400: return "The request payload was malformed.";
    case 401: return "Authentication credentials were missing or invalid.";
    case 403: return "The credential does not have access to this resource.";
    case 404: return "The requested resource was not found.";
    case 429: return "Rate limit exceeded. Retry after backoff.";
    case 502: return "Upstream provider returned an invalid response.";
    case 503: return "Upstream provider is temporarily unavailable.";
    default: return "The upstream server encountered an unexpected condition.";
  }
}

export const MOCK_API_LOGS: MockApiLog[] = [
  buildLog({ id: "log_001", minutesAgo: 3, companyId: "cmp_001", companyName: "ABC Pvt Ltd", endpoint: "/employees", method: "GET", statusCode: 200, responseTimeMs: 142 }),
  buildLog({ id: "log_002", minutesAgo: 5, companyId: "cmp_006", companyName: "Horizon Tech", endpoint: "/attendance/check-in", method: "POST", statusCode: 201, responseTimeMs: 168 }),
  buildLog({ id: "log_003", minutesAgo: 8, companyId: "cmp_002", companyName: "XYZ Ltd", endpoint: "/attendance", method: "POST", statusCode: 500, responseTimeMs: 842 }),
  buildLog({ id: "log_004", minutesAgo: 12, companyId: "cmp_003", companyName: "DEF Industries", endpoint: "/employees", method: "GET", statusCode: 200, responseTimeMs: 98 }),
  buildLog({ id: "log_005", minutesAgo: 14, companyId: "cmp_008", companyName: "Bright Retail Group", endpoint: "/attendance/check-out", method: "POST", statusCode: 200, responseTimeMs: 176 }),
  buildLog({ id: "log_006", minutesAgo: 18, companyId: "cmp_012", companyName: "Crestwood Pharma", endpoint: "/employees/EMP-2291", method: "GET", statusCode: 401, responseTimeMs: 88 }),
  buildLog({ id: "log_007", minutesAgo: 21, companyId: "cmp_009", companyName: "Pinnacle Construction", endpoint: "/employees", method: "GET", statusCode: 200, responseTimeMs: 121 }),
  buildLog({ id: "log_008", minutesAgo: 24, companyId: "cmp_011", companyName: "Vantage Manufacturing", endpoint: "/attendance/check-in", method: "POST", statusCode: 200, responseTimeMs: 155 }),
  buildLog({ id: "log_009", minutesAgo: 27, companyId: "cmp_007", companyName: "Coastal Logistics", endpoint: "/leave", method: "GET", statusCode: 200, responseTimeMs: 133 }),
  buildLog({ id: "log_010", minutesAgo: 30, companyId: "cmp_002", companyName: "XYZ Ltd", endpoint: "/employees", method: "GET", statusCode: 429, responseTimeMs: 45 }),
  buildLog({ id: "log_011", minutesAgo: 34, companyId: "cmp_013", companyName: "Lakeside Energy", endpoint: "/attendance/check-out", method: "POST", statusCode: 200, responseTimeMs: 162 }),
  buildLog({ id: "log_012", minutesAgo: 39, companyId: "cmp_001", companyName: "ABC Pvt Ltd", endpoint: "/employees/EMP-1042", method: "PATCH", statusCode: 200, responseTimeMs: 140 }),
  buildLog({ id: "log_013", minutesAgo: 44, companyId: "cmp_006", companyName: "Horizon Tech", endpoint: "/departments", method: "GET", statusCode: 200, responseTimeMs: 101 }),
  buildLog({ id: "log_014", minutesAgo: 48, companyId: "cmp_012", companyName: "Crestwood Pharma", endpoint: "/attendance", method: "POST", statusCode: 502, responseTimeMs: 910 }),
  buildLog({ id: "log_015", minutesAgo: 52, companyId: "cmp_003", companyName: "DEF Industries", endpoint: "/leave/LV-330", method: "GET", statusCode: 404, responseTimeMs: 76 }),
  buildLog({ id: "log_016", minutesAgo: 57, companyId: "cmp_008", companyName: "Bright Retail Group", endpoint: "/employees", method: "GET", statusCode: 200, responseTimeMs: 118 }),
  buildLog({ id: "log_017", minutesAgo: 63, companyId: "cmp_009", companyName: "Pinnacle Construction", endpoint: "/attendance/check-in", method: "POST", statusCode: 200, responseTimeMs: 149 }),
  buildLog({ id: "log_018", minutesAgo: 70, companyId: "cmp_007", companyName: "Coastal Logistics", endpoint: "/employees", method: "GET", statusCode: 200, responseTimeMs: 400 }),
  buildLog({ id: "log_019", minutesAgo: 78, companyId: "cmp_011", companyName: "Vantage Manufacturing", endpoint: "/employees/EMP-5510", method: "DELETE", statusCode: 403, responseTimeMs: 91 }),
  buildLog({ id: "log_020", minutesAgo: 86, companyId: "cmp_013", companyName: "Lakeside Energy", endpoint: "/employees", method: "GET", statusCode: 200, responseTimeMs: 108 }),
  buildLog({ id: "log_021", minutesAgo: 95, companyId: "cmp_001", companyName: "ABC Pvt Ltd", endpoint: "/attendance/check-in", method: "POST", statusCode: 200, responseTimeMs: 137 }),
  buildLog({ id: "log_022", minutesAgo: 104, companyId: "cmp_002", companyName: "XYZ Ltd", endpoint: "/attendance/check-out", method: "POST", statusCode: 500, responseTimeMs: 780 }),
  buildLog({ id: "log_023", minutesAgo: 118, companyId: "cmp_006", companyName: "Horizon Tech", endpoint: "/leave", method: "PUT", statusCode: 200, responseTimeMs: 152 }),
  buildLog({ id: "log_024", minutesAgo: 130, companyId: "cmp_009", companyName: "Pinnacle Construction", endpoint: "/employees", method: "GET", statusCode: 200, responseTimeMs: 112 }),
];
