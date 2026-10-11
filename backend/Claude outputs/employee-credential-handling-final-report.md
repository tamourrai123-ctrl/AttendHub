# Employee Module — Correct Credential Handling for HR-Sourced Employees
## Final Report

## 1. Backend Changes

**`backend/src/employees/dto/create-employee.dto.ts`**
Removed the `password` field (and its `@IsString()/@IsNotEmpty()` validators) entirely. `CreateEmployeeDto` now has exactly: `name` (required), `email` (required), `phone` (optional), `mobile` (optional). Updated the class doc comment to state the credential architecture: employees are HR-system records, credentials originate in the external HR software, and any `password`/`c_password` field submitted is rejected with 400 by the global `forbidNonWhitelisted: true` ValidationPipe (verified directly in `main.ts`).

**`backend/src/employees/dto/update-employee.dto.ts`**
No field changes needed (`UpdateEmployeeDto extends PartialType(CreateEmployeeDto)` automatically loses `password` once it's gone from `CreateEmployeeDto`). Updated the doc comment to state explicitly that a `password`/`c_password` field is rejected with 400, not silently stripped.

**`backend/src/employees/repositories/prisma-employees.repository.ts`**
- Added `import { generateRawToken } from '../../auth/utils/token.util'`.
- `create()`: no longer accepts or hashes `dto.password` (it doesn't exist). Instead generates a compatibility placeholder: `hashPassword(generateRawToken())` — 32 cryptographically random bytes, bcrypt-hashed with the project's existing `hashPassword()` utility (cost factor 12) — and stores that in `c_password`. This value is never derived from the employee's name, email, id, or company, and is discarded from memory immediately after hashing (never logged, never returned).
- `updateInCompany()`: removed all password-hashing logic. It can now only touch `name`/`email`/`phone`/`mobile`. `c_password` is never read, rotated, or otherwise touched by an update — it is treated as an internal compatibility value set once at creation.
- Added a detailed doc comment on `create()` explaining the credential architecture, why the placeholder exists, what it is not, and the future direction (HR-software-backed authentication via the Integration Gateway — not implemented here).

**`backend/src/employees/employees.service.ts`**
Removed `if (dto.password !== undefined) safeChanges.passwordChanged = true;` from `update()`. There is no longer any credential-related field to guard against in the audit log, since `UpdateEmployeeDto` has no `password` field at all.

**No other backend files were changed.** `employees.controller.ts`, `employees.module.ts`, `me.controller.ts`, `in-memory-employees.repository.ts`, and the `employee.interface.ts` interface were inspected and require no changes — none of them reference the removed field directly.

## 2. Frontend Changes

**`frontend/src/types/employee.ts`** — rewritten to match the real backend contract exactly: `Employee { id, companyId, companyName, name, email, phone, mobile }`, `CreateEmployeeInput { name, email, phone?, mobile? }`, `UpdateEmployeeInput`, `EmployeeListQuery`, `EmployeeListResult`. Removed `EmployeeStatus`, `EmployeeStats`, and the mock-only fields (`employeeCode`, `department`, `designation`, `status`, `joinedAt`), none of which exist on `usm_users`.

**`frontend/src/api/employees.ts`** — new file, modeled on the existing `api/companies.ts` pattern. Talks to the real `/employees` routes (`GET`, `GET /:id`, `POST`, `PATCH /:id`, `DELETE /:id`) via the shared `apiClient`. `companyId` is never sent — the backend derives it server-side from the session. No password field appears anywhere in this module.

**`frontend/src/pages/company/Employees.tsx`** — rewritten to use the real API (`createEmployee`/`getEmployees`/`updateEmployee`/`deleteEmployee` from `api/employees.ts`) instead of `mockEmployeeService`. Removed the status/department filters and the activate/deactivate action (no corresponding backend fields). Table columns are now Employee (name/email), Phone, Mobile, Actions. Actions are View / Edit / Delete — delete replaces the old status toggle as the destructive action.

**`frontend/src/pages/company/employees/EmployeeFormModal.tsx`** — rewritten. Fields are exactly `name`, `email`, `phone`, `mobile` — matching `CreateEmployeeDto`/`UpdateEmployeeDto`. No password field, no confirm-password field, no "generate password" action, no reset/change-password action, anywhere in the form.

**`frontend/src/pages/company/employees/EmployeeDetailsDrawer.tsx`** — rewritten to display only real fields (email, company, phone, mobile). Removed the status badge, employee code, department, and designation display. The Attendance Summary section is unchanged (still calls `getCompanyAttendanceReport`).

**`frontend/src/mock/employees.ts`** — rewritten to define its own local `Mock*`-prefixed types (`MockEmployee`, `MockEmployeeStatus`, `MockCreateEmployeeInput`, `MockUpdateEmployeeInput`, `MockEmployeeListQuery`, `MockEmployeeListResult`, `MockEmployeeStats`) instead of importing from `types/employee.ts`. Seed data (10 rows) is unchanged.

**`frontend/src/services/mockEmployeeService.ts`** — import-source change only: now imports its types from `mock/employees.ts`, aliased back to the same local names it used before (`CreateEmployeeInput`, `Employee`, etc.). Every function body is byte-for-byte unchanged.

**`frontend/src/lib/statusBadges.ts`** — `EMPLOYEE_STATUS_BADGE`/`EMPLOYEE_STATUS_LABEL` are retyped against `MockEmployeeStatus` (from `mock/employees.ts`) instead of the now-removed `EmployeeStatus` (from `types/employee.ts`). This was necessary because `pages/user/Profile.tsx` still displays an employee status badge and still needs these constants to exist and compile.

**`frontend/src/pages/company/Dashboard.tsx`** and **`frontend/src/pages/user/Profile.tsx`** — changed only their type-import line, from `types/employee.ts` to `mock/employees.ts` (aliased back to the same local names: `EmployeeStats`, `Employee`). No other code changed — both pages still run entirely on `mockEmployeeService`, since migrating them to the real API is out of scope for this phase.

**Why the mock-era type relocation was necessary:** `types/employee.ts` had to be rewritten to match the real backend contract (per this task's explicit requirement), but `Dashboard.tsx` and `Profile.tsx` are not being migrated in this phase and still depend on the richer mock-era shape (`employeeCode`/`department`/`designation`/`status`). Relocating that shape into `mock/employees.ts` under a `Mock*` naming convention, then aliasing it back in the three consuming files, satisfies both constraints with zero behavior change to any of those three files' logic — this is the "tiny compatibility adjustment... required by compilation" the task allows for.

## 3. Credential Handling

- **Does `POST /employees` still accept a password?** No. `CreateEmployeeDto` has no `password` field. A `password` field in the request body is rejected with 400 (unrecognized field, `forbidNonWhitelisted: true`).
- **Does `PATCH /employees/:id` still accept a password?** No, for the same reason (`UpdateEmployeeDto` derives from `CreateEmployeeDto`).
- **Is `usm_users.c_password` still written during employee CRUD?** Written once, at creation only. Never touched by update.
- **What value is stored, and why?** A bcrypt hash (cost 12) of 32 cryptographically random bytes (`generateRawToken()`), generated fresh per employee. It exists solely to satisfy the `c_password NOT NULL` database constraint, which this phase deliberately does not change.
- **Can that value be used as an employee login credential?** No. The random plaintext is discarded immediately after hashing — nobody, including AttendHub itself, ever knows it. It is never emailed, displayed, or communicated anywhere, so no login attempt can ever produce a matching bcrypt comparison in practice.
- **Is the value returned or logged?** No. `toEmployee()` never reads `c_password` into the API response shape, and `EmployeesService.update()`'s system-log payload is built as an explicit allow-list (`name`/`email`/`phone`/`mobile`) that never includes it.
- **Can a Company Admin manage employee credentials anywhere?** No — not on create, not on update, not through any other endpoint. There is no password field, reset action, or credential-generation action anywhere in the Employees API surface or the frontend form.
- **Is AttendHub's HR password ever copied into `c_password`?** No — AttendHub never has the employee's actual HR-system password in the first place; nothing is copied, reversed, or "unhashed." This is a compatibility placeholder, not a credential mirror.

## 4. Database

No schema changes were made. Confirmed via direct review of `backend/prisma/schema.prisma`: `usm_users`, `c_password`, and every other column are untouched. No table was created, dropped, or altered. No migration was run. No existing employee row was modified, deleted, or migrated — this phase only changes what happens on future `create`/`update` calls.

## 5. Authentication

No changes to `bcrypt` configuration, JWT handling, session handling, Company Admin or Super Admin authentication, password reset, email verification, or the global `AuthGuard`/`RolesGuard`. `Role.EMPLOYEE`, `MeController`, `GET /me`, `GET /attendance/me`, `AuthenticatedUser.employeeId`, `usm_user_sessions.employee_id`, employee-role RBAC, and the employee demo account are all untouched and still present exactly as before. The only credential-related behavior removed is Employee CRUD's ability to create or change an employee's `c_password` from user input.

## 6. Tests

**Updated tests** (`backend/test/employees.e2e-spec.ts`):
- Create: a new test confirms a `password` field in the request body is rejected with 400 and no row is created; a new test confirms an employee can be created with no password field, that `c_password` is set to an unpredictable bcrypt hash not derived from the employee's id/name/company, and that two different employees get two different placeholder hashes.
- Update: a new test confirms a `password` field on `PATCH` is rejected with 400 and leaves the existing `c_password` completely unchanged; a new test confirms an ordinary HR-data update never writes any password-related key (`password`, `c_password`, `passwordChanged`) into the system log.
- `backend/test/auth-rbac.e2e-spec.ts`: the one employee-creation call in the "COMPANY_ADMIN can list their own employees" test no longer sends a `password` field. The unrelated `cmp_001`/`cmp_002` company-ID-mismatch test was **not** touched, per instruction — that failure is pre-existing and out of scope.

**Build/validation status — confirmed on the real project (run on your machine, not this sandbox):**

- `npx prisma validate` — "The schema at prisma\schema.prisma is valid 🚀". No schema drift from this phase's (deliberately schema-untouched) changes.
- `npx prisma generate` — Prisma Client regenerated successfully, no errors.
- `npm run build` (backend, `nest build`) — completed with no errors.
- `npm run test:e2e -- employees.e2e-spec.ts auth-rbac.e2e-spec.ts` — **both suites passed, 38/38 tests green**, including the new credential-handling tests: password rejected with 400 on both create and update, `c_password` set to an unpredictable placeholder hash on create and left untouched by update, no password-related key written to system logs, and the updated `auth-rbac` employee-creation fixture.
- `npm run build` (frontend, `tsc -b && vite build`) — full project type-check plus production build completed with no errors, output emitted to `dist/`.

(Note: this sandbox's own network access to `registry.npmjs.org`/`pypi.org` was blocked all session — 403 on every package, confirmed against unrelated control packages too — so I could only run a scoped `tsc --noEmit` syntax check locally as a stand-in. That check found nothing wrong, and the above real runs on your machine now confirm it directly: real `prisma validate`/`generate`, both real builds, and the real e2e test suite all pass clean.)

## 7. Remaining Architecture (explicitly NOT implemented in this phase)

- HR → AttendHub employee data sync (employees are still created/edited directly by the Company Admin, not received from an external HR system).
- A dedicated HR-sourced employee storage model — `usm_users` is unchanged and still holds employee rows alongside admin rows.
- The mobile employee app.
- Removal of `Role.EMPLOYEE` or any employee-role RBAC.
- Removal of employee login (`GET /me`, `GET /attendance/me`, the employee demo account, and employee session handling all remain exactly as before).
- Real (database-backed) Attendance/Leave persistence — those modules are untouched and still use their existing architecture (plain `employeeId`, no foreign key to `usm_users`).
- Any future HR-software-backed authentication flow for employees/mobile — a code comment documents the intended future contract in `prisma-employees.repository.ts`, but no such flow is implemented.

## 8. Recommended Next Phase

Design (but do not yet implement) the HR Integration → Employee sync contract: define exactly which HR-system fields map onto `usm_users`' employee-relevant columns, how a sync would identify "this HR employee = this usm_users row" without a shared credential, and how conflicting concurrent edits (Company Admin edit vs. HR sync) would be resolved — before writing any sync code. This directly de-risks the `c_password` compatibility placeholder's stated end state ("retained only until the employee storage model is redesigned") by defining what that redesign actually needs to account for.

---

*Note: a mid-session tool-sequencing error briefly overwrote all in-progress edits with their pre-edit originals before they were ever committed to disk. This was caught before any file was committed, all 16 edits were redone from the documented final content, verified with a fresh syntax check, and committed successfully — confirmed by byte-level re-read after the write. No data was lost from the actual project; the loss was confined to this session's own in-progress working copies.*
