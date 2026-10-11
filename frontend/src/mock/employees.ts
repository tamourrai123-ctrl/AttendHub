/**
 * MOCK DATA — development only. Seed data for `mockEmployeeService`.
 *
 * These types are DELIBERATELY LOCAL to this mock layer, not imported
 * from `types/employee.ts`. As of the Employee Credential Handling phase,
 * `types/employee.ts` was rewritten to match the REAL backend contract
 * (id/companyId/companyName/name/email/phone/mobile only — no
 * employeeCode/department/designation/status/joinedAt, since usm_users has
 * no corresponding columns), which pages/company/Employees.tsx now uses
 * via the real api/employees.ts client.
 *
 * mockEmployeeService.ts is still used by pages/company/Dashboard.tsx
 * (employee headcount stats) and pages/user/Profile.tsx (Employee
 * self-service profile) — neither of those has been migrated to the real
 * API in this phase, and both still depend on the richer mock-era fields
 * (employeeCode, department, designation, status). Relocating those
 * fields here (renamed with a `Mock` prefix) keeps that dependency
 * working with zero behavior change, while letting `types/employee.ts`
 * accurately describe the real API.
 *
 * `usr_employee` (the demo Employee login, John Carter) maps to `emp_001`
 * below via `User.employeeId` — see mock/users.ts. The cmp_002 records exist
 * solely to prove tenant isolation: no demo login belongs to that company,
 * so they should never appear in the UI no matter who is logged in.
 */

export type MockEmployeeStatus = "ACTIVE" | "INACTIVE";

export interface MockEmployee {
  id: string;
  /** Human-readable code shown in the UI, e.g. "EMP-1001". */
  employeeCode: string;
  name: string;
  email: string;
  department: string;
  designation: string;
  status: MockEmployeeStatus;
  companyId: string;
  companyName: string;
  /** ISO timestamp */
  joinedAt: string;
}

export interface MockCreateEmployeeInput {
  name: string;
  email: string;
  employeeCode: string;
  department: string;
  designation: string;
  status: MockEmployeeStatus;
}

export type MockUpdateEmployeeInput = Partial<MockCreateEmployeeInput>;

export interface MockEmployeeListQuery {
  companyId: string;
  search?: string;
  status?: MockEmployeeStatus | "ALL";
  department?: string | "ALL";
  page?: number;
  pageSize?: number;
}

export interface MockEmployeeListResult {
  items: MockEmployee[];
  total: number;
  page: number;
  pageSize: number;
}

export interface MockEmployeeStats {
  total: number;
  active: number;
  inactive: number;
}

export const MOCK_EMPLOYEES: MockEmployee[] = [
  { id: "emp_001", employeeCode: "EMP-1001", name: "John Carter", email: "john.carter@abc.test", department: "Sales", designation: "Sales Executive", status: "ACTIVE", companyId: "cmp_001", companyName: "ABC Pvt Ltd", joinedAt: "2023-03-06T09:00:00Z" },
  { id: "emp_002", employeeCode: "EMP-1002", name: "Fatima Noor", email: "fatima.noor@abc.test", department: "Engineering", designation: "Software Engineer", status: "ACTIVE", companyId: "cmp_001", companyName: "ABC Pvt Ltd", joinedAt: "2022-11-14T09:00:00Z" },
  { id: "emp_003", employeeCode: "EMP-1003", name: "Ahmed Raza", email: "ahmed.raza@abc.test", department: "Operations", designation: "Operations Manager", status: "ACTIVE", companyId: "cmp_001", companyName: "ABC Pvt Ltd", joinedAt: "2021-07-19T09:00:00Z" },
  { id: "emp_004", employeeCode: "EMP-1004", name: "Sara Malik", email: "sara.malik@abc.test", department: "HR", designation: "HR Coordinator", status: "INACTIVE", companyId: "cmp_001", companyName: "ABC Pvt Ltd", joinedAt: "2024-01-22T09:00:00Z" },
  { id: "emp_005", employeeCode: "EMP-1005", name: "Usman Tariq", email: "usman.tariq@abc.test", department: "Finance", designation: "Finance Analyst", status: "ACTIVE", companyId: "cmp_001", companyName: "ABC Pvt Ltd", joinedAt: "2023-09-04T09:00:00Z" },
  { id: "emp_006", employeeCode: "EMP-1006", name: "Zara Sheikh", email: "zara.sheikh@abc.test", department: "IT", designation: "IT Support Specialist", status: "ACTIVE", companyId: "cmp_001", companyName: "ABC Pvt Ltd", joinedAt: "2022-05-30T09:00:00Z" },
  { id: "emp_007", employeeCode: "EMP-1007", name: "Hamza Iqbal", email: "hamza.iqbal@abc.test", department: "Marketing", designation: "Marketing Lead", status: "ACTIVE", companyId: "cmp_001", companyName: "ABC Pvt Ltd", joinedAt: "2024-06-11T09:00:00Z" },
  { id: "emp_008", employeeCode: "EMP-1008", name: "Mahnoor Aslam", email: "mahnoor.aslam@abc.test", department: "Sales", designation: "Account Manager", status: "INACTIVE", companyId: "cmp_001", companyName: "ABC Pvt Ltd", joinedAt: "2021-02-08T09:00:00Z" },

  // Different company — must never appear for the ABC Pvt Ltd Company Admin.
  { id: "emp_101", employeeCode: "EMP-2001", name: "Nida Farooq", email: "nida.farooq@xyz.test", department: "Finance", designation: "Accountant", status: "ACTIVE", companyId: "cmp_002", companyName: "XYZ Ltd", joinedAt: "2023-04-17T09:00:00Z" },
  { id: "emp_102", employeeCode: "EMP-2002", name: "Owais Anwar", email: "owais.anwar@xyz.test", department: "Engineering", designation: "QA Engineer", status: "ACTIVE", companyId: "cmp_002", companyName: "XYZ Ltd", joinedAt: "2022-08-25T09:00:00Z" },
];
