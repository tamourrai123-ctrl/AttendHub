/**
 * Outcome of one Employee Sync pass (EmployeeSyncService.syncCompany()) for
 * a single company/integration — returned to the manual "Sync Now" route
 * (HrEmployeesController.sync()) for display, and logged (as a summary,
 * never the raw HR records) by both that route and the background
 * scheduler (EmployeeSyncSchedulerService).
 *
 * Deliberately has no "deleted"/"deactivated" count — this feature never
 * removes or disables an AttendHub employee just because they no longer
 * appear in the HR system's list (see EmployeeSyncService's own doc
 * comment for why). An HR record missing from AttendHub's own roster is
 * always additive (created), never a reason to touch an existing row that
 * the HR system stopped returning.
 */
export interface EmployeeSyncResult {
  companyId: string;
  integrationId: string;
  /** How many HR employee records the EMPLOYEES endpoint returned this pass, before any reconciliation. */
  totalFetched: number;
  /** New AttendHub employees created because their externalId wasn't linked to any existing employee yet. */
  created: number;
  /** Existing linked employees whose name/email changed in the HR system and were updated to match. */
  updated: number;
  /** Existing linked employees whose name/email already matched the HR record — no write performed. */
  unchanged: number;
  /** HR records missing a usable externalId/name/email and therefore not processed at all. */
  skipped: number;
  /** HR records that failed while being created/updated (e.g. a conflicting email already used by a different employee) — see `errors` for details. */
  failed: number;
  /** Human-readable detail for every skipped or failed record, in the order encountered. Never includes the full HR record body (which may carry PII beyond name/email). */
  errors: string[];
}
