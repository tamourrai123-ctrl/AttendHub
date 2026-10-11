/**
 * Backed by the real `usm_users` table (see PrismaEmployeesRepository and
 * the Employees migration report). `usm_users` is shared by multiple user
 * types under one table (Company Admins, possibly Super Admins, and plain
 * Employees, all distinguished only by the `is_admin`/`super_admin` flags —
 * there is no separate "employees" table). This API only ever surfaces
 * rows the repository has determined are plain Employees — see
 * PrismaEmployeesRepository's `isPlainEmployeeRow`, the one place that
 * assumption is made.
 *
 * `employeeCode`, `department`, `designation`, `status`, `joinedAt` from
 * the pre-migration in-memory model are deliberately NOT part of this type
 * — `usm_users` has no corresponding columns for any of them. Per the
 * stated architecture (HR software is the source of employee
 * authentication/data), that HR-specific profile data is expected to come
 * from the connected external HR system in a future phase, not from
 * AttendHub's own database. See the Employees migration report, sections
 * H/N.
 *
 * `c_password` is deliberately NOT part of this type and must never be
 * added to it — see the Employees migration report's security section.
 *
 * `integrationId`/`externalEmployeeId` (Phase A.2): the minimal HR
 * identity key — which integration (if any) this employee is linked to,
 * and the HR system's own id for them. Both null for an employee with no
 * HR link yet. Deliberately NOT profile data — no HR name/email/
 * department/salary is stored anywhere on this type; name/email/phone/
 * mobile above remain the pre-existing Company-Admin-entered fields, kept
 * as-is this phase (see the Phase A.2 report for why they were not removed
 * now). `integrationId` is exposed as a decimal string, matching every
 * other Prisma BigInt id elsewhere in this API (e.g. `id` above).
 */
export interface Employee {
  id: string;
  companyId: string;
  companyName: string;
  name: string;
  email: string;
  phone: string | null;
  mobile: string | null;
  integrationId: string | null;
  externalEmployeeId: string | null;
}
