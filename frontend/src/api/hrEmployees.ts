import { apiClient, type ApiSuccessResponse } from "./client";
import type { EmployeeSyncResult } from "../types/employeeSync";

/**
 * Talks to backend/src/integrations/hr-employees.controller.ts's manual
 * sync route: POST /integrations/:integrationId/hr-employees/sync. Fetches
 * the connected HR system's employee list and reconciles it into
 * AttendHub's own employee table (create new, update changed name/email,
 * never delete or deactivate) — see EmployeeSyncService's doc comment on
 * the backend. The exact same reconciliation also runs automatically in
 * the background every 30 minutes; this is only the manual "Sync from HR"
 * trigger on the Employees page.
 *
 * companyId is required by the backend the same way every other
 * integration-scoped route needs it (integration_master's composite primary
 * key, see api/integrations.ts) — taken from the already-loaded Integration
 * record, never typed in by the user.
 */
export async function syncEmployeesFromHr(integrationId: string, companyId: string): Promise<EmployeeSyncResult> {
  const query = new URLSearchParams({ companyId }).toString();
  const response = await apiClient.post<ApiSuccessResponse<EmployeeSyncResult>>(
    `/integrations/${encodeURIComponent(integrationId)}/hr-employees/sync?${query}`,
  );
  return response.data;
}
