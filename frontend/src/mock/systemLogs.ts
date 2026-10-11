import type { SystemLogDetail } from "../types/systemLog";

/** MOCK DATA — development only. Seed data for `mockSystemLogService`. */

const NOW = new Date("2026-09-11T10:55:00Z").getTime();

function isoMinutesAgo(minutesAgo: number): string {
  return new Date(NOW - minutesAgo * 60_000).toISOString();
}

export const MOCK_SYSTEM_LOGS: SystemLogDetail[] = [
  { id: "syslog_001", timestamp: isoMinutesAgo(6), user: "Rai Tamour", action: "Company Created", resource: "Company", resourceId: "cmp_014", severity: "INFO", description: "Created Summit Education Trust", metadata: { companyId: "cmp_014", initialStatus: "SUSPENDED" } },
  { id: "syslog_002", timestamp: isoMinutesAgo(15), user: "Rai Tamour", action: "Integration Test Failed", resource: "Integration", resourceId: "int_002", severity: "ERROR", description: "Connection test failed for XYZ Ltd", metadata: { integrationId: "int_002", statusCode: 500, message: "Upstream timeout" } },
  { id: "syslog_003", timestamp: isoMinutesAgo(28), user: "System", action: "Company Suspended", resource: "Company", resourceId: "cmp_005", severity: "WARNING", description: "Skyline Foods automatically suspended after repeated billing failures (simulated)", metadata: { companyId: "cmp_005", reason: "billing_failure_simulated" } },
  { id: "syslog_004", timestamp: isoMinutesAgo(40), user: "Rai Tamour", action: "Settings Updated", resource: "Settings", severity: "INFO", description: "Updated platform notification preferences", metadata: { changed: ["notifications.apiFailureAlerts"] } },
  { id: "syslog_005", timestamp: isoMinutesAgo(55), user: "Rai Tamour", action: "Field Mapping Updated", resource: "Integration", resourceId: "int_007", severity: "INFO", description: "Updated field mapping for Coastal Logistics", metadata: { integrationId: "int_007", fieldsChanged: 2 } },
  { id: "syslog_006", timestamp: isoMinutesAgo(70), user: "System", action: "Integration Error", resource: "Integration", resourceId: "int_012", severity: "ERROR", description: "Crestwood Pharma integration returned repeated 5xx responses", metadata: { integrationId: "int_012", consecutiveFailures: 4 } },
  { id: "syslog_007", timestamp: isoMinutesAgo(85), user: "Rai Tamour", action: "Company Updated", resource: "Company", resourceId: "cmp_007", severity: "INFO", description: "Updated contact details for Coastal Logistics", metadata: { companyId: "cmp_007", fieldsChanged: ["contactPerson", "phone"] } },
  { id: "syslog_008", timestamp: isoMinutesAgo(102), user: "System", action: "Rate Limit Warning", resource: "Integration", resourceId: "int_002", severity: "WARNING", description: "XYZ Ltd exceeded 80% of its API rate limit", metadata: { integrationId: "int_002", usagePercent: 84 } },
  { id: "syslog_009", timestamp: isoMinutesAgo(120), user: "Rai Tamour", action: "Company Activated", resource: "Company", resourceId: "cmp_004", severity: "INFO", description: "Nova Textiles reactivated after onboarding review", metadata: { companyId: "cmp_004" } },
  { id: "syslog_010", timestamp: isoMinutesAgo(140), user: "System", action: "Auth Token Refreshed", resource: "Integration", resourceId: "int_006", severity: "INFO", description: "OAuth token refreshed for Horizon Tech", metadata: { integrationId: "int_006" } },
  { id: "syslog_011", timestamp: isoMinutesAgo(165), user: "Rai Tamour", action: "Company Deleted", resource: "Company", resourceId: "cmp_099", severity: "WARNING", description: "Deleted a duplicate test company record", metadata: { companyId: "cmp_099" } },
  { id: "syslog_012", timestamp: isoMinutesAgo(190), user: "System", action: "Critical Sync Failure", resource: "Integration", resourceId: "int_012", severity: "CRITICAL", description: "Crestwood Pharma sync has failed for over 2 hours — manual review recommended", metadata: { integrationId: "int_012", failureWindowMinutes: 130 } },
  { id: "syslog_013", timestamp: isoMinutesAgo(210), user: "Rai Tamour", action: "Login", resource: "Auth", severity: "INFO", description: "Super Admin signed in", metadata: { method: "mock-session" } },
  { id: "syslog_014", timestamp: isoMinutesAgo(240), user: "System", action: "Scheduled Sync Completed", resource: "Platform", severity: "INFO", description: "Scheduled sync completed for 11 of 14 companies", metadata: { succeeded: 11, failed: 3 } },
  { id: "syslog_015", timestamp: isoMinutesAgo(300), user: "Rai Tamour", action: "Integration Connected", resource: "Integration", resourceId: "int_004", severity: "INFO", description: "Started onboarding integration for Nova Textiles", metadata: { integrationId: "int_004" } },
];
