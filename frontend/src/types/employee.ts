/**
 * Employee domain types (Employee Credential Handling phase).
 *
 * This shape matches the REAL backend contract — backend/src/employees/
 * dto/create-employee.dto.ts, update-employee.dto.ts, and the Employee
 * interface returned by PrismaEmployeesRepository.toEmployee() — not a
 * mock-era shape. Employees are HR-system records, not AttendHub portal
 * login accounts: employee credentials originate in the connected
 * external HR software, never in this application.
 *
 * There is NO password field, ever, on either the create or update shape.
 * The backend's CreateEmployeeDto/UpdateEmployeeDto do not accept one, and
 * the global ValidationPipe (forbidNonWhitelisted: true) rejects any
 * unrecognized field — including `password` — with a 400, so this type
 * intentionally does not offer one to submit in the first place.
 *
 * Fields present on mock-era employees (employeeCode, department,
 * designation, status, joinedAt) do NOT exist on usm_users and are
 * deliberately absent here — see mock/employees.ts for the separate
 * mock-only shape still used by the not-yet-migrated Dashboard/Profile
 * pages.
 *
 * Every employee belongs to exactly one company (`companyId`); every real
 * API call in api/employees.ts is scoped server-side to the authenticated
 * Company Admin's own company.
 */

export interface Employee {
  id: string;
  companyId: string;
  companyName: string;
  name: string;
  email: string;
  phone: string | null;
  mobile: string | null;
  /** HR integration this employee is linked to (null if not linked). */
  integrationId: string | null;
  /** The HR system's own id for this employee (null if not linked). */
  externalEmployeeId: string | null;
}

export interface CreateEmployeeInput {
  name: string;
  email: string;
  phone?: string;
  mobile?: string;
  /** Sent only together with externalEmployeeId (backend requires the pair). */
  integrationId?: string;
  /** HR Employee ID — the id the company's HR system uses for this employee. */
  externalEmployeeId?: string;
}

export type UpdateEmployeeInput = Partial<CreateEmployeeInput>;

export interface EmployeeListQuery {
  page?: number;
  limit?: number;
  search?: string;
}

export interface EmployeeListResult {
  items: Employee[];
  page: number;
  limit: number;
  total: number;
}
