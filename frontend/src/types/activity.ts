/**
 * Richer activity item for the Control Panel dashboard (action/entity/user/
 * status), distinct from the simpler `ActivityItem` in `types/common.ts`
 * used by the Company/Employee panels — kept separate so Phase 2 doesn't
 * have to touch that Phase 1 type or its consumers.
 */
export interface PlatformActivityItem {
  id: string;
  action: string;
  entity: string;
  user: string;
  /** ISO timestamp */
  timestamp: string;
  status: "success" | "warning" | "error" | "info";
}
