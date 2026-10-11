import type { ActivityItem } from "../types/common";
import type { PlatformActivityItem } from "../types/activity";

const NOW = new Date("2026-09-11T10:55:00Z").getTime();
function isoMinutesAgo(minutesAgo: number): string {
  return new Date(NOW - minutesAgo * 60_000).toISOString();
}

/**
 * Phase 2 Control Dashboard "Recent Activity" feed — richer than
 * `CONTROL_RECENT_ACTIVITY` below (action/entity/user/status), used
 * alongside the mock services rather than replacing the Phase 1 export
 * (kept in case something still references it).
 */
export const PLATFORM_ACTIVITY: PlatformActivityItem[] = [
  { id: "pact_1", action: "Company Created", entity: "Summit Education Trust", user: "Rai Tamour", timestamp: isoMinutesAgo(6), status: "info" },
  { id: "pact_2", action: "Integration Test Failed", entity: "XYZ Ltd", user: "Rai Tamour", timestamp: isoMinutesAgo(15), status: "error" },
  { id: "pact_3", action: "Company Suspended", entity: "Skyline Foods", user: "System", timestamp: isoMinutesAgo(28), status: "warning" },
  { id: "pact_4", action: "Settings Updated", entity: "Notification preferences", user: "Rai Tamour", timestamp: isoMinutesAgo(40), status: "info" },
  { id: "pact_5", action: "Field Mapping Updated", entity: "Coastal Logistics", user: "Rai Tamour", timestamp: isoMinutesAgo(55), status: "success" },
  { id: "pact_6", action: "Integration Error", entity: "Crestwood Pharma", user: "System", timestamp: isoMinutesAgo(70), status: "error" },
];

export const CONTROL_RECENT_ACTIVITY: ActivityItem[] = [
  { id: "act_1", message: "ABC Pvt Ltd integration connected", timestamp: "5 minutes ago", tone: "success" },
  { id: "act_2", message: "XYZ Ltd API request failed", timestamp: "22 minutes ago", tone: "error" },
  { id: "act_3", message: "New company registered — Nova Textiles", timestamp: "1 hour ago", tone: "info" },
  { id: "act_4", message: "Company DEF Industries activated", timestamp: "3 hours ago", tone: "success" },
  { id: "act_5", message: "System Logs export completed", timestamp: "Yesterday", tone: "info" },
];

export const COMPANY_RECENT_ACTIVITY: ActivityItem[] = [
  { id: "cact_1", message: "Fatima Noor checked in late", timestamp: "12 minutes ago", tone: "warning" },
  { id: "cact_2", message: "Sara Malik's leave request approved", timestamp: "40 minutes ago", tone: "success" },
  { id: "cact_3", message: "Ahmed Raza marked absent", timestamp: "2 hours ago", tone: "error" },
  { id: "cact_4", message: "Monthly attendance report generated", timestamp: "Yesterday", tone: "info" },
];
