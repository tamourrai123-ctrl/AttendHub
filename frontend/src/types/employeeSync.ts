/**
 * Matches the real backend's EmployeeSyncResult shape exactly — see
 * backend/src/integrations/interfaces/employee-sync-result.interface.ts.
 * Returned by POST /integrations/:integrationId/hr-employees/sync.
 *
 * The exact same reconciliation (create new, update changed, never delete)
 * also runs automatically in the background every 30 minutes
 * (EmployeeSyncSchedulerService) — this type is only ever populated here
 * from the manual "Sync from HR" button's response, not from the scheduled
 * background pass.
 */
export interface EmployeeSyncResult {
  companyId: string;
  integrationId: string;
  /** How many HR employee records the EMPLOYEES endpoint returned this pass. */
  totalFetched: number;
  /** New AttendHub employees created because they weren't linked yet. */
  created: number;
  /** Existing linked employees whose name/email changed in the HR system and were updated to match. */
  updated: number;
  /** Existing linked employees that already matched — no write performed. */
  unchanged: number;
  /** HR records missing a usable id/name/email and therefore not processed. */
  skipped: number;
  /** HR records that failed while being created/updated. */
  failed: number;
  /** Human-readable detail for every skipped or failed record. */
  errors: string[];
}
