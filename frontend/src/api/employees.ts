import { apiClient, type ApiMessageResponse, type ApiSuccessResponse } from "./client";
import type {
  CreateEmployeeInput,
  Employee,
  EmployeeListQuery,
  EmployeeListResult,
  UpdateEmployeeInput,
} from "../types/employee";

/**
 * Real Employees API — Employee Credential Handling phase. Talks to the
 * actual backend routes in backend/src/employees/employees.controller.ts
 * (all `@Roles(Role.COMPANY_ADMIN)`):
 *   GET    /employees            (query: page, limit, search)
 *   GET    /employees/:id
 *   POST   /employees
 *   PATCH  /employees/:id
 *   DELETE /employees/:id
 *
 * companyId is never sent from here on any call — every route derives it
 * server-side from the authenticated Company Admin's session (see
 * EmployeesController.requireCompanyId()), the same pattern api/companies.ts
 * follows for Super Admin-scoped company reads.
 *
 * There is no password field anywhere in this module, on either side.
 * Employees are HR-system records, not AttendHub portal login accounts —
 * see CreateEmployeeDto's doc comment (backend) and types/employee.ts (this
 * side) for the full rationale. This module is a drop-in replacement for
 * the old services/mockEmployeeService.ts — Employees.tsx and its form
 * modal/details drawer depend only on these exported function signatures.
 */

interface RawEmployeeListData {
  items: Employee[];
  meta: { page: number; limit: number; total: number };
}

export async function getEmployees(query: EmployeeListQuery = {}): Promise<EmployeeListResult> {
  const response = await apiClient.get<ApiSuccessResponse<RawEmployeeListData>>("/employees", {
    page: query.page,
    limit: query.limit,
    search: query.search,
  });
  const { items, meta } = response.data;
  return { items, page: meta.page, limit: meta.limit, total: meta.total };
}

export async function getEmployeeById(id: string): Promise<Employee> {
  const response = await apiClient.get<ApiSuccessResponse<Employee>>(`/employees/${encodeURIComponent(id)}`);
  return response.data;
}

export async function createEmployee(input: CreateEmployeeInput): Promise<Employee> {
  const response = await apiClient.post<ApiSuccessResponse<Employee>>("/employees", input);
  return response.data;
}

export async function updateEmployee(id: string, input: UpdateEmployeeInput): Promise<Employee> {
  const response = await apiClient.patch<ApiSuccessResponse<Employee>>(`/employees/${encodeURIComponent(id)}`, input);
  return response.data;
}

/** Resolves with the backend's confirmation message (`okMessage(...)`). */
export async function deleteEmployee(id: string): Promise<string> {
  const response = await apiClient.delete<ApiMessageResponse>(`/employees/${encodeURIComponent(id)}`);
  return response.message;
}
