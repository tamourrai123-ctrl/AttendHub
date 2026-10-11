import type { BadgeStatus } from "../types/common";
import type { CompanyStatus, IntegrationHealthStatus } from "../types/company";
import type { LogSeverity } from "../types/systemLog";
import type { ApiLogStatusGroup } from "../types/apiLog";
import type { AttendanceStatus } from "../types/attendance";

type MockEmployeeStatus = "ACTIVE" | "INACTIVE";

/**
 * Single source of truth for "this status always looks the same everywhere"
 * (Companies, Integrations, dashboard summaries, etc. all import from here
 * instead of each inventing their own status → color mapping).
 *
 * Phase 2/Part C: LEAVE_STATUS_BADGE/LEAVE_STATUS_LABEL have been removed.
 * Leave's `leaveStatus` is no longer a fixed AttendHub-defined enum — it's
 * freeform text straight from the connected HR system (see types/leave.ts),
 * so there is nothing fixed here to map it to. The Leave page renders it as
 * plain text / an unstyled badge instead.
 */

export const COMPANY_STATUS_BADGE: Record<CompanyStatus, BadgeStatus> = {
  ACTIVE: "active",
  INACTIVE: "inactive",
  SUSPENDED: "suspended",
};

export const COMPANY_STATUS_LABEL: Record<CompanyStatus, string> = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  SUSPENDED: "Suspended",
};

export const INTEGRATION_STATUS_BADGE: Record<IntegrationHealthStatus, BadgeStatus> = {
  CONNECTED: "connected",
  DISCONNECTED: "disconnected",
  WARNING: "warning",
  ERROR: "error",
  TESTING: "testing",
};

export const INTEGRATION_STATUS_LABEL: Record<IntegrationHealthStatus, string> = {
  CONNECTED: "Connected",
  DISCONNECTED: "Disconnected",
  WARNING: "Warning",
  ERROR: "Error",
  TESTING: "Testing",
};

export const SEVERITY_BADGE: Record<LogSeverity, BadgeStatus> = {
  INFO: "info",
  WARNING: "warning",
  ERROR: "error",
  CRITICAL: "critical",
};

export const SEVERITY_LABEL: Record<LogSeverity, string> = {
  INFO: "Info",
  WARNING: "Warning",
  ERROR: "Error",
  CRITICAL: "Critical",
};

export const API_STATUS_GROUP_BADGE: Record<ApiLogStatusGroup, BadgeStatus> = {
  "2xx": "active",
  "4xx": "warning",
  "5xx": "error",
};

// As of the Employee Credential Handling phase, the real Employee type
// (see types/employee.ts) has no `status` field at all — usm_users has no
// corresponding column, so this is no longer keyed by a "real" employee
// status. It's retyped against mock/employees.ts's MockEmployeeStatus,
// which is what pages/user/Profile.tsx (still on the mock data layer)
// actually uses.
export const EMPLOYEE_STATUS_BADGE: Record<MockEmployeeStatus, BadgeStatus> = {
  ACTIVE: "active",
  INACTIVE: "inactive",
};

export const EMPLOYEE_STATUS_LABEL: Record<MockEmployeeStatus, string> = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
};

export const ATTENDANCE_STATUS_BADGE: Record<AttendanceStatus, BadgeStatus> = {
  PRESENT: "active",
  ABSENT: "error",
  LATE: "warning",
  HALF_DAY: "info",
  ON_LEAVE: "inactive",
};

export const ATTENDANCE_STATUS_LABEL: Record<AttendanceStatus, string> = {
  PRESENT: "Present",
  ABSENT: "Absent",
  LATE: "Late",
  HALF_DAY: "Half Day",
  ON_LEAVE: "On Leave",
};
