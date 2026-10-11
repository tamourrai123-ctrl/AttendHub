import {
  MOCK_EMPLOYEES,
  type MockCreateEmployeeInput as CreateEmployeeInput,
  type MockEmployee as Employee,
  type MockEmployeeListQuery as EmployeeListQuery,
  type MockEmployeeListResult as EmployeeListResult,
  type MockEmployeeStats as EmployeeStats,
  type MockUpdateEmployeeInput as UpdateEmployeeInput,
} from "../mock/employees";
import { cloneSeed, delay, generateId, ServiceError } from "./serviceUtils";

/**
 * Mock data layer — as of the Employee Credential Handling phase, this is
 * NOT the data source for pages/company/Employees.tsx any more (that page
 * now uses the real api/employees.ts client). This file is still used by
 * pages/company/Dashboard.tsx (employee headcount stats) and
 * pages/user/Profile.tsx (Employee self-service profile), both of which
 * depend on mock-era fields (employeeCode/department/designation/status)
 * that no longer exist on the real Employee type — see mock/employees.ts's
 * doc comment. Types are imported from there (aliased back to these local
 * names) purely so this file's own code below needs no changes.
 *
 * MULTI-TENANT RULE: every function here takes (or already knows) the
 * caller's `companyId` and filters by it. `getEmployeeById`/`updateEmployee`/
 * `setEmployeeStatus` all treat "found, but belongs to a different company"
 * the same as "not found" — this is what a real backend would do once it
 * enforces tenant isolation server-side, so the mock mirrors that shape
 * rather than trusting the caller.
 */
let employees: Employee[] = cloneSeed(MOCK_EMPLOYEES);

const NETWORK_DELAY_MS = 450;

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function findOwned(id: string, companyId: string): Employee | undefined {
  return employees.find((e) => e.id === id && e.companyId === companyId);
}

export async function getEmployees(query: EmployeeListQuery): Promise<EmployeeListResult> {
  await delay(NETWORK_DELAY_MS);

  const { companyId, search = "", status = "ALL", department = "ALL", page = 1, pageSize = 8 } = query;

  const filtered = employees.filter((e) => {
    if (e.companyId !== companyId) return false;
    const matchesSearch =
      !search ||
      normalize(e.name).includes(normalize(search)) ||
      normalize(e.email).includes(normalize(search)) ||
      normalize(e.employeeCode).includes(normalize(search));
    const matchesStatus = status === "ALL" || e.status === status;
    const matchesDepartment = department === "ALL" || e.department === department;
    return matchesSearch && matchesStatus && matchesDepartment;
  });

  const sorted = [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  const total = sorted.length;
  const start = (page - 1) * pageSize;
  const items = sorted.slice(start, start + pageSize);

  return { items, total, page, pageSize };
}

export async function getEmployeeById(id: string, companyId: string): Promise<Employee | undefined> {
  await delay(NETWORK_DELAY_MS);
  return findOwned(id, companyId);
}

export async function getEmployeeStats(companyId: string): Promise<EmployeeStats> {
  await delay(NETWORK_DELAY_MS);
  const scoped = employees.filter((e) => e.companyId === companyId);
  return {
    total: scoped.length,
    active: scoped.filter((e) => e.status === "ACTIVE").length,
    inactive: scoped.filter((e) => e.status === "INACTIVE").length,
  };
}

export async function createEmployee(companyId: string, companyName: string, input: CreateEmployeeInput): Promise<Employee> {
  await delay(NETWORK_DELAY_MS);

  const duplicate = employees.some(
    (e) => e.companyId === companyId && (normalize(e.email) === normalize(input.email) || normalize(e.employeeCode) === normalize(input.employeeCode))
  );
  if (duplicate) {
    throw new ServiceError("An employee with this email or employee ID already exists.");
  }

  const created: Employee = {
    id: generateId("emp"),
    employeeCode: input.employeeCode.trim(),
    name: input.name.trim(),
    email: input.email.trim(),
    department: input.department.trim(),
    designation: input.designation.trim(),
    status: input.status,
    companyId,
    companyName,
    joinedAt: new Date().toISOString(),
  };

  employees = [created, ...employees];
  return created;
}

export async function updateEmployee(id: string, companyId: string, input: UpdateEmployeeInput): Promise<Employee> {
  await delay(NETWORK_DELAY_MS);

  const index = employees.findIndex((e) => e.id === id && e.companyId === companyId);
  if (index === -1) {
    throw new ServiceError("This employee no longer exists.");
  }

  if (input.email || input.employeeCode) {
    const duplicate = employees.some(
      (e) =>
        e.id !== id &&
        e.companyId === companyId &&
        ((input.email && normalize(e.email) === normalize(input.email)) ||
          (input.employeeCode && normalize(e.employeeCode) === normalize(input.employeeCode)))
    );
    if (duplicate) {
      throw new ServiceError("An employee with this email or employee ID already exists.");
    }
  }

  const updated: Employee = { ...employees[index], ...input };
  employees = [...employees.slice(0, index), updated, ...employees.slice(index + 1)];
  return updated;
}

export async function setEmployeeStatus(id: string, companyId: string, status: Employee["status"]): Promise<Employee> {
  return updateEmployee(id, companyId, { status });
}
