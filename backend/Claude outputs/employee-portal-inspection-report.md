# AttendHub — Employee Portal Functionality Inspection Report

**Type:** Read-only inspection. **No code, files, database, Prisma schema, or migrations were changed as part of this task.**

**Product decision this report is written against:** AttendHub will have only two portal login roles going forward — `SUPER_ADMIN` and `COMPANY_ADMIN`. There will be no AttendHub employee/user portal login. Employees remain as HR data (list, attendance, leave, reports, mobile sync, HR integration mapping) — nothing about employee *data* is being removed, only employee *login/portal* functionality.

---

## A. Executive Summary

AttendHub currently implements employees as **full login-capable accounts** sharing the exact same table (`usm_users`) as Super Admin and Company Admin accounts. There is no separate "employee" table — an employee is simply a `usm_users` row where `is_admin != 'Y'` and `super_admin != 'Y'`. This one fact drives almost everything else in this report.

Concretely, today's employee-related surface area breaks into three distinct kinds of things that this task asks to be told apart:

1. **Employee-as-portal-user (login) functionality** — a real, working login/session/self-service system: `Role.EMPLOYEE` in the RBAC enum, `GET /me`, `GET /attendance/me`, the entire frontend `/user/*` portal (Dashboard/Attendance/Leave/Profile + `UserLayout`), the `employee@tamotam.test` demo account, and employee-specific test suites. This is what the product decision says should eventually disappear.
2. **Employee-as-HR-data functionality** — the Company Admin's employee list (`GET/POST/PATCH/DELETE /employees`), and Attendance/Leave/Reports, all of which must be kept and in fact **already read employees as data, not as authenticated actors**, wherever they're Company-Admin-facing.
3. **A structural conflation of the two** — the single biggest finding of this inspection: `POST /employees` (a Company Admin action for adding an HR employee record) **requires and stores a login password** (`usm_users.c_password`) on every single employee it creates. Today, there is no way to add an "employee" to AttendHub without simultaneously provisioning that employee an AttendHub login account. This is the piece of code most responsible for employee-login and employee-data being inseparable right now, and it's the clearest thing that needs reworking (not removing) before employee login can be safely retired.

Good news for the removal effort: Attendance and Leave are **already** decoupled from `usm_users`/login. Both modules identify employees purely through a free-standing, denormalized `employeeId` string (e.g. `'emp_001'`) with no Prisma relation/foreign key to `usm_users` at all. They are currently backed by read-only in-memory mock data (no real HR sync yet), but structurally they already prove out the target design: an HR employee can be identified by a stable ID without requiring that employee to ever log in to AttendHub.

Bad news / open item: the frontend's own Employee list page (`pages/company/Employees.tsx`) is *still fully mock-backed* and was never migrated to the real `/employees` API (unlike Companies, which was completed earlier in this engagement). Its form fields (`employeeCode`, `department`, `designation`, `status`) don't exist on the real backend at all, and it has no password field despite the real endpoint requiring one. This is a pre-existing, unrelated bug — not caused by the employee-portal question — but it will need to be addressed in the same rework pass, since fixing "employee creation shouldn't require a password" and "the employee form doesn't match the real API" are the same piece of work.

No mobile app code exists in this repository. Several backend doc comments (Leave, in particular) refer to "the existing mobile app" as an external system that already handles employee-side leave requests, implying employee identity/auth for that mobile app happens somewhere outside this codebase — this is flagged as an open uncertainty in section on uncertainties below.

---

## B. SAFE TO REMOVE LATER (AttendHub employee portal/login functionality only)

These exist *only* because AttendHub currently lets employees log in as portal users. None of them store or represent HR data themselves — removing them does not touch any employee record.

**Backend:**
- `Role.EMPLOYEE` enum member (`common/constants/roles.enum.ts`) — once no route requires it.
- `GET /me` — `MeController` (`employees/me.controller.ts`), `@Roles(Role.EMPLOYEE)`. Returns the caller's own profile via session `employeeId`/`companyId`. Exists solely for employee self-service.
- `GET /attendance/me` — in `AttendanceController`, `@Roles(Role.EMPLOYEE)`, uses `user.employeeId` from session. Exists solely for employee self-service viewing of their own attendance.
- The `employeeId` field on `AuthenticatedUser` and on `usm_user_sessions` rows, once nothing populates/reads it for a non-login purpose (see Section I — Attendance/Leave should be repointed to a stable HR employee ID that is *not* the login session's `employeeId` before this is dropped).
- The `employee@tamotam.test` / `employee123` demo account in `InMemoryUsersRepository` (backend) and its login fallback path, once the demo-account bridge is no longer needed for other still-mock modules (see Section I).
- `backend/src/employees/repositories/in-memory-employees.repository.ts` — already confirmed dead code today (not instantiated anywhere; its own doc comment says "left on disk for reference only"). Safe to delete independent of everything else in this report, any time — it currently has zero effect on the running application.
- EMPLOYEE-specific test cases in `backend/test/employees.e2e-spec.ts` (the `EMPLOYEE_SELF_TOKEN`/`/me`-style tests) and `backend/test/auth-rbac.e2e-spec.ts` (login-as-employee, `/me`, `/attendance/me`, 403-on-`/employees` cases) — once the corresponding endpoints are gone.

**Frontend:**
- The entire `/user/*` route tree: `pages/user/Dashboard.tsx`, `Attendance.tsx`, `Leave.tsx`, `Profile.tsx`.
- `layouts/UserLayout.tsx` — dedicated employee-portal shell/nav (Home, My Attendance, Leave, Profile).
- `EMPLOYEE` branch of `lib/permissions.ts` (`ROLE_PERMISSIONS.EMPLOYEE`, `ROLE_HOME_ROUTE.EMPLOYEE`, `ROLE_LABELS.EMPLOYEE`) — once no route or UI needs to route/label an employee role.
- The EMPLOYEE demo account entry in `mock/users.ts` (`MOCK_ACCOUNTS`, `DEMO_CREDENTIAL_HINTS`) and its surfacing in the Login page's demo-credentials panel.
- Any `EMPLOYEE`/`UserRole.EMPLOYEE` branches in route-guarding code (`ProtectedRoute.tsx`, `AppRoutes.tsx`) once the role itself is retired.

None of the above touches `usm_users` rows, employee names/emails/phone numbers, or any HR data. It is exclusively login/session/self-service *code*.

---

## C. MUST KEEP (HR employee data, Attendance, Leave, Reports, Mobile, HR sync, Company Admin employee viewing)

- **`usm_users` table itself** — required for Super Admin and Company Admin accounts regardless of what happens to employee login; also, until a real HR-sync/HR employee table exists, it remains the only place employee records live at all (see Section F for the column-level breakdown; do not delete this table).
- **`GET/POST/PATCH/DELETE /employees`** (`EmployeesController`, `@Roles(Role.COMPANY_ADMIN)`) — the Company Admin's HR employee list/management functionality. Must be kept as a concept; the password-provisioning side effect inside it is what needs REWORK (Section D), not removal of the endpoint.
- **`EmployeesService`, `PrismaEmployeesRepository`** — the real data-access layer behind the above. Keep, rework the `create()`/`update()` password handling.
- **`GET /attendance`** (Company Admin, company-scoped) and all of `AttendanceService`/`AttendanceRecord` — HR/attendance data Company Admin views. No employee login involved already.
- **`GET /leave`** (Company Admin, company-scoped) and all of `LeaveService`/`LeaveRecord` — same as above.
- **`GET /reports/attendance`** (`ReportsController`/`ReportsService`) — pure aggregation over attendance data; no employee-auth dependency at all.
- **Frontend `pages/company/Employees.tsx`, `EmployeeFormModal.tsx`** — Company Admin's employee list UI. Must be kept as a feature (needs rework to match the real API contract — see Section D/G — but the page's purpose, "Company Admin views/manages HR employee records," is not going away).
- **Every `employeeId`/`employeeName`/`employeeCode` field used by Attendance, Leave, and Reports** — these are free-standing HR-identity fields, not login credentials, and per the task's explicit instruction, must not be removed just because employee login is going away.
- **Any future HR sync / Integration Gateway employee mapping** — out of scope to build here, but nothing in the current employee data model should be removed in a way that would block it.

---

## D. REWORK (code combining employee auth with employee data that should be separated)

1. **`POST /employees` requires and stores a password** (`create-employee.dto.ts` → `EmployeesService.create()` → `PrismaEmployeesRepository.create()`). This is the central conflation in the codebase: adding an HR employee record currently *is* provisioning an AttendHub login account (`c_password` is bcrypt-hashed and written to `usm_users` on every creation). Before employee login can be retired, this write path needs to stop requiring/setting a password at all — "add an employee" should become a pure HR-data write with no auth side effect.
2. **`PATCH /employees/:id`** (`EmployeesService.update()`) — currently allows changing an employee's password as part of an HR-data edit (tracked via a `passwordChanged: true` flag in its audit log to avoid logging the raw value, but the capability itself still exists). Needs to be separated: HR-data edits (name/email/phone) vs. login-credential edits are different concerns and, per the product decision, the latter category should not exist for employees going forward.
3. **`isPlainEmployeeRow()` / `plainEmployeeWhereConditions()`** (`prisma-employees.repository.ts`) — today, "is this row an employee" is inferred from the *absence* of admin flags on the shared login table (`is_admin !== 'Y' && super_admin !== 'Y'`). This is a reasonable stopgap but it means employee identity is structurally defined as "a login account that happens not to be an admin," rather than as its own first-class concept. Any future HR-employee table (fed by the Integration Gateway) should give employees their own identity independent of `usm_users`, at which point this inference logic goes away.
4. **Frontend `Employees.tsx` / `EmployeeFormModal.tsx` field mismatch** — the form collects `employeeCode`/`department`/`designation`/`status` (none of which exist in the real backend's `Employee`/`CreateEmployeeDto`) and collects no password (which the real endpoint currently requires). This is a pre-existing, independent bug — not created by the employee-login question — but any rework of item 1 (removing the password requirement) should happen together with fixing this form/contract mismatch, since both changes touch the same create-employee flow.
5. **`EmployeesController`/`PlansController` audit-log actor-name lookups** via `InMemoryUsersRepository.findById(user.userId)` — a real accounts (signup, real employee) don't resolve to a name in that repository (documented gap in `auth.module.ts`). Not employee-portal-specific (affects Companies/Integrations/Endpoints/Field Mappings too), but worth reworking alongside any employee auth changes since `InMemoryUsersRepository` is also home to the `employee@tamotam.test` demo account being retired in Section B.

---

## E. DATABASE (employee-related tables/models)

| Table / Model | What it stores | Classification | Notes |
|---|---|---|---|
| `usm_users` | ALL login-capable accounts: Super Admin, Company Admin, **and** Employee, in one table, role derived from `is_admin`/`super_admin` flags | **KEEP / REWORK** | Required for Super Admin & Company Admin regardless of employee-login decision. See Section F for column-level breakdown. Do not remove. Long-term, once employee login is retired and a real HR-employee table exists, plain-employee rows here could be migrated out — but that is future work, not today's inspection. |
| `usm_user_sessions` | Revocable session records (`token_hash`, `role`, `company_id`, `employee_id`, timestamps) | **KEEP / REWORK** | Required for Super Admin/Company Admin sessions. The `employee_id`/`role='EMPLOYEE'` sessions specifically become removable once employee login is retired. |
| `usm_company` | Tenant table | **KEEP** | No employee-login dependency at all. |
| Attendance data (currently `InMemoryAttendanceRepository`, no Prisma model yet) | `employeeId`, `employeeCode`, `employeeName`, `companyId`, date/status/times — free-standing, no FK to `usm_users` | **KEEP** | Already structurally independent of login. Will need a real Prisma-backed table once HR sync lands; that table should key off a stable HR employee ID, not a `usm_users` id. |
| Leave data (currently `InMemoryLeaveRepository`, no Prisma model yet) | `employeeId`, `employeeName`, `companyId`, leave type/dates/status — same pattern as Attendance | **KEEP** | Same as above. |
| `in-memory-employees.repository.ts` (not a DB table — in-process mock) | Dead/legacy seed data, not wired into any module | **REMOVE** (safe now, independent of this task's other findings) | Confirmed unused; module explicitly does not provide it. |
| Any future HR-employee / integration-mapping table | N/A — does not exist yet | **UNKNOWN / Future work** | Not to be designed or implemented here per task constraints; flagged as the eventual home for employee HR data once decoupled from `usm_users`. |

---

## F. `usm_users` — SUPER_ADMIN/COMPANY_ADMIN vs. EMPLOYEE-only fields

Per the task's explicit instruction, this is a conservative, per-column analysis. **No column is classified as removable purely because it "sounds" employee-related; only columns whose entire purpose is employee login/session are flagged, and even those are marked for later, not now.**

| Column | Used by Super Admin / Company Admin? | Used only for Employee login/profile? | Removable later? | Dependencies |
|---|---|---|---|---|
| `company_id`, `user_id` (composite PK) | Yes — identifies every account | No | Not removable — structural PK | All FKs into this table, all session records |
| `user_name` | Yes | Also used for employees (their name, which is HR data, not login-only) | **No** — this is HR data (employee name) even after login is removed | `/employees` list, Attendance/Leave display of `employeeName` conceptually maps here today |
| `email_address` | Yes — login identifier for all roles | Also used for employee login | Partially — remains needed as an HR contact field for employees even without login | Global uniqueness constraint; login lookup |
| `c_password` | Yes — required for Super Admin/Company Admin login | Yes — currently required for employee creation too (Section D finding) | **Employee usage removable later** once `POST /employees` no longer sets it; column itself stays for the other two roles | `EmployeesService.create/update`, login flow |
| `phone`, `mobile` | Optional contact fields for any role | Also used for employees | **No** — HR contact data, not login-only | `/employees` responses |
| `is_admin` | Yes — this is literally what makes a row a Company Admin | Yes — its *absence* is what makes a row "count as" an employee (`isPlainEmployeeRow`) | **No** — load-bearing for role derivation for all three roles today | RolesGuard-adjacent role derivation, `prisma-employees.repository.ts` |
| `super_admin` | Yes — makes a row a Super Admin | Same as above (absence implies non-admin) | **No** | Same as above |
| `account_locked` | Yes, applies to any account | Applies to employee accounts too, but never actually set to `'Y'` by any code path currently | **No** — general-purpose account field | `login()` |
| `email_verify_token_hash` / expiry | Yes, generic | Applies to employees too if they ever verify email | **No** | Verify-email flow |
| `reset_token_hash` / expiry | Yes, generic | Applies to employees too if they ever reset password | **Employee usage removable later** once employees can't log in / have no password to reset | Forgot/reset-password flow |

**Bottom line for Section F:** there is effectively **no `usm_users` column whose sole purpose is "employee login" in a way that's cleanly severable today** — every column either serves Super Admin/Company Admin directly, or serves both login *and* HR-data purposes simultaneously (name, email, phone are HR data; password/tokens are the two login-specific concerns, and only those should shrink in employee-relevance once login is retired, not be deleted from the table). This matches the task's caution: do not classify by name, classify by actual current usage.

---

## G. FRONTEND (employee pages, forms, routes, components, services, types, mocks)

| Item | Kind | Portal-login (A) or HR-data (B)? | Status |
|---|---|---|---|
| `pages/user/Dashboard.tsx` | Page | A | Safe to remove later |
| `pages/user/Attendance.tsx` | Page | A | Safe to remove later (self-service view; Company Admin's `Attendance` list page, if any, is separate and kept) |
| `pages/user/Leave.tsx` | Page | A | Safe to remove later |
| `pages/user/Profile.tsx` | Page | A | Safe to remove later |
| `layouts/UserLayout.tsx` | Layout/nav shell | A | Safe to remove later |
| `pages/company/Employees.tsx` | Page | B | Must keep; needs rework to hit real `/employees` API (currently mock-only) |
| `pages/company/employees/EmployeeFormModal.tsx` | Form | B | Must keep; field set needs rework (drop `employeeCode`/`department`/`designation`/`status` or map them to real fields once available; remove implicit assumption of no password / add password handling per Section D decision) |
| `types/employee.ts` | Types | B (mock-era) | Needs rework — does not match real backend `Employee`/`CreateEmployeeDto` |
| `services/mockEmployeeService.ts` | Mock API client | B (mock only) | Legacy — same category as `mockCompanyService.ts` was before the Companies migration; retire once `Employees.tsx` is wired to the real API |
| `mock/employees.ts` | Mock seed data | B (mock only) | Legacy, same as above |
| `mock/users.ts` (`MOCK_ACCOUNTS` EMPLOYEE entry, `DEMO_CREDENTIAL_HINTS`) | Mock/demo data | A | Safe to remove later |
| `lib/permissions.ts` (`EMPLOYEE` entries) | Routing/permission config | A | Safe to remove later |
| `ProtectedRoute.tsx` / `AppRoutes.tsx` EMPLOYEE branches | Routing | A | Safe to remove later |
| `components/layout/Sidebar.tsx` | Shared layout component | Neither — generic, reused by all three portal shells | Keep; not employee-specific itself |

---

## H. BACKEND (employee controllers, services, repositories, DTOs, guards, endpoints)

| Item | Kind | A or B? | Status |
|---|---|---|---|
| `employees/employees.controller.ts` | Controller (`@Roles(COMPANY_ADMIN)`) | B | Keep (rework password handling — Section D) |
| `employees/me.controller.ts` (`MeController`) | Controller (`@Roles(EMPLOYEE)`) | A | Safe to remove later |
| `employees/employees.service.ts` | Service | B | Keep (rework `create`/`update` — Section D) |
| `employees/repositories/prisma-employees.repository.ts` | Repository | B | Keep (rework `create()` — Section D); `isPlainEmployeeRow` logic flagged for future rework |
| `employees/repositories/in-memory-employees.repository.ts` | Repository | Neither (dead code) | Remove — already confirmed unused |
| `employees/dto/create-employee.dto.ts` | DTO | B, currently conflated with A (password field) | Rework — drop required `password` |
| `employees/dto/update-employee.dto.ts` | DTO | Same as above | Rework alongside create DTO |
| `employees/dto/list-employees.dto.ts` | DTO | B | Keep as-is |
| `employees/interfaces/employee.interface.ts` | Interface | B | Keep as-is; already correctly excludes mock-only fields and documents the future HR-integration expectation |
| `employees/employees.module.ts` | Module wiring | B | Keep; already correctly excludes the dead in-memory repo |
| `attendance/attendance.controller.ts` — `GET /attendance` | Endpoint | B | Keep |
| `attendance/attendance.controller.ts` — `GET /attendance/me` | Endpoint | A | Safe to remove later |
| `attendance/attendance.service.ts`, interfaces, repository | Service/data layer | B | Keep — already decoupled from login |
| `leave/leave.controller.ts`, `.service.ts`, interfaces, repository | Full module | B | Keep — already decoupled from login, read-only by design (mobile app owns writes) |
| `reports/reports.controller.ts`, `.service.ts` | Full module | B | Keep — no employee-auth dependency |
| `monitoring/*`, `system-logs/*`, `pricing/plans.controller.ts` | Full modules | Neither | Keep — no employee dependency of any kind (Super Admin / public only) |
| `Role.EMPLOYEE` enum member, `@Roles(Role.EMPLOYEE)` usages | RBAC | A | Safe to remove later, only after B and D items above no longer need it |
| `AuthenticatedUser.employeeId` field | Auth interface | Currently A (login-session field) but also read by B endpoints (`/attendance/me`, `/me`) | Safe to remove later, in lockstep with removing those two endpoints |
| `InMemoryUsersRepository`'s `employee@tamotam.test` demo account | Legacy/demo | A | Safe to remove later (see Section I for why not immediately) |
| `backend/test/employees.e2e-spec.ts`, `auth-rbac.e2e-spec.ts` EMPLOYEE cases | Tests | A | Safe to remove later, once corresponding endpoints are gone |

---

## I. DEPENDENCY RISKS (must NOT be deleted without tracing further)

- **`usm_users` table** — do not delete or drop columns. Still backs Super Admin and Company Admin login, and remains the only current home for employee HR data (name/email/phone) until a real HR-employee table exists.
- **`is_admin` / `super_admin` flag columns** — load-bearing for role derivation for *all three* roles today, including how the system currently tells an "employee" row apart from an admin row (`isPlainEmployeeRow`). Removing employee login must not touch these columns.
- **The `employee@tamotam.test` demo-account login fallback** — per the prior auth/RBAC inspection report, this fallback is currently a **load-bearing dependency for other still-mock-backed modules and at least one e2e suite**, not just an employee-portal artifact. Removing it prematurely (before those other modules/tests are migrated) would break things unrelated to the employee-portal decision. Sequence this carefully (see Section J).
- **`AuthenticatedUser.employeeId` / `usm_user_sessions.employee_id`** — currently the *only* mechanism by which `/attendance/me` and `/me` identify "which employee is this." Attendance's and Leave's own data layers do NOT depend on this (they use their own denormalized `employeeId` string), so removing employee login does not break Attendance/Leave's read side — but if any future code path tries to reuse the *session's* `employeeId` as the join key into a real HR-employee table, that linkage needs to be explicitly redesigned, not assumed away.
- **Frontend `EMPLOYEE` role in `lib/permissions.ts`, `ProtectedRoute.tsx`, `AppRoutes.tsx`** — these are read by shared routing code; removing the enum value without first removing all references will break TypeScript compilation, not just runtime behavior.
- **The "existing mobile app"** — referenced only in doc comments (Leave module), with no code in this repository. Nothing here can characterize how it authenticates or identifies employees today. Do not assume it depends on `usm_users` login OR that it doesn't — this needs a direct product/engineering answer before any employee-login removal work touches shared identity fields the mobile app might rely on (see uncertainties below).
- **`EmployeesController`'s `password` requirement** — removing this without first updating the frontend form (Section D item 4) and without deciding what (if anything) replaces it will break `POST /employees` for the one caller that currently supplies a password... except note the frontend form *doesn't even collect one today*, meaning the real `/employees` create endpoint is likely already broken/unreachable end-to-end from the current UI. This should be verified, not assumed, before any rework begins.

---

## J. PROPOSED CLEANUP ORDER (sequence only — do NOT perform this now)

1. **Resolve the open uncertainties** below with the product/engineering team (mobile app auth mechanism; timeline for real HR sync) — several later steps depend on the answers.
2. **Migrate the frontend Employees feature off mock data and onto the real `/employees` API**, fixing the field-set mismatch (Section D item 4) at the same time. This is largely independent of the login-removal work and unblocks testing the next step.
3. **Rework `POST/PATCH /employees` to stop requiring/setting a password** (Section D items 1–2), decoupling "create/edit an HR employee record" from "provision a login account."
4. **Migrate the other modules still relying on the `employee@tamotam.test` demo-account fallback** (per the auth/RBAC report, several mock-backed modules and one e2e suite depend on it) so the fallback is no longer load-bearing for anything unrelated to employee login.
5. **Remove `GET /me` and `GET /attendance/me`**, and the `Role.EMPLOYEE`-gated code paths that back them, once nothing else needs them.
6. **Remove the `Role.EMPLOYEE` enum value and all `@Roles(Role.EMPLOYEE)` usages** (backend) and the `EMPLOYEE` branches in `lib/permissions.ts`/`ProtectedRoute.tsx`/`AppRoutes.tsx` (frontend), once steps 3–5 mean nothing depends on the role existing.
7. **Remove the frontend `/user/*` route tree and `UserLayout`**, and the `employee@tamotam.test` demo account/login fallback entirely, once step 4 confirms no other module needs it.
8. **Remove the now-fully-dead `employees.e2e-spec.ts`/`auth-rbac.e2e-spec.ts` EMPLOYEE test cases**, and delete `in-memory-employees.repository.ts` (this one is actually safe to do independently, any time, since it's already unused).
9. **Only after all of the above**, consider whether/how to migrate employee HR records out of `usm_users` into a dedicated HR-employee table fed by the Integration Gateway — this is future architectural work, explicitly out of scope for this cleanup and not to be designed here.

---

## Closing Tallies

**Files inspected (backend):** `employees.controller.ts`, `employees.service.ts`, `employees.module.ts`, `me.controller.ts`, `dto/create-employee.dto.ts`, `dto/update-employee.dto.ts`, `dto/list-employees.dto.ts`, `interfaces/employee.interface.ts`, `repositories/prisma-employees.repository.ts`, `repositories/in-memory-employees.repository.ts`; `attendance.controller.ts`, `attendance.service.ts`, `interfaces/attendance-record.interface.ts`, `repositories/in-memory-attendance.repository.ts`; `leave.controller.ts`, `leave.service.ts`, `interfaces/leave-record.interface.ts`, `repositories/in-memory-leave.repository.ts`; `reports.controller.ts`, `reports.service.ts`; `monitoring.controller.ts`; `system-logs.controller.ts`; `plans.controller.ts`; `auth` module (guards, decorators, `AuthenticatedUser` interface, `InMemoryUsersRepository`) from the prior inspection pass; Prisma schema (`usm_users`, `usm_company`, `usm_user_sessions`); `test/employees.e2e-spec.ts` (partial), `test/auth-rbac.e2e-spec.ts` (grep-level). Roughly 25 backend files.

**Frontend files inspected:** `pages/user/Dashboard.tsx`, `Attendance.tsx`, `Leave.tsx`, `Profile.tsx`; `layouts/UserLayout.tsx`; `pages/company/Employees.tsx`, `employees/EmployeeFormModal.tsx`; `types/employee.ts`; `services/mockEmployeeService.ts`; `mock/employees.ts`; `mock/users.ts`; `lib/permissions.ts`; `components/layout/Sidebar.tsx`; `App.tsx`; routing files (`AppRoutes.tsx`, `ProtectedRoute.tsx`) from the prior inspection pass. Roughly 14 frontend files.

**Database models/tables inspected:** `usm_users`, `usm_company`, `usm_user_sessions` (full column-level read); Attendance/Leave in-memory data shapes (no Prisma model exists yet for either).

**Endpoints inspected:** `GET/POST/PATCH/DELETE /employees`, `GET /me`, `GET /attendance`, `GET /attendance/me`, `GET /leave`, `GET /reports/attendance`, `GET /monitoring`, `GET /monitoring/summary`, `GET /system-logs`, `GET /system-logs/:id`, `GET /plans`, `GET /plans/all`, `GET /plans/:id`, `POST/PATCH/DELETE /plans/:id`, plus the full `/auth/*` set from the prior inspection pass.

**Frontend routes/forms inspected:** `/user/dashboard`, `/user/attendance`, `/user/leave`, `/user/profile`, `/company/employees` (list + create/edit form modal).

**Exact employee-only (portal/login) functionality identified:** `Role.EMPLOYEE` enum value; `GET /me`; `GET /attendance/me`; `AuthenticatedUser.employeeId` (as a login-session concept); the `employee@tamotam.test` demo account and its login fallback; the entire frontend `/user/*` route tree and `UserLayout`; the `EMPLOYEE` entries in `lib/permissions.ts`, `mock/users.ts`, and role-branching route guards; EMPLOYEE-specific test cases in two e2e suites.

**Uncertainties requiring a product decision:**
1. **Mobile app authentication** — no mobile app code exists in this repository; doc comments in the Leave module say the existing mobile app already handles employee leave requests (and implicitly attendance capture) today. It is unknown whether that mobile app currently authenticates against AttendHub's own `/auth/login` using an `EMPLOYEE` `usm_users` row, or via a separate, external mechanism. This materially affects whether removing employee login would break the mobile app, and needs an answer before Section J's later steps are executed.
2. **Timeline/ownership for real HR sync** — Attendance/Leave are currently read-only, in-memory mock data, not yet connected to any real HR integration pipeline. This report treats their free-standing `employeeId` design as structurally sound, but does not know when/how real data will start flowing in, which affects how urgently the `usm_users`-as-employee-table situation (Section F) needs a long-term replacement.
3. **Whether `POST /employees` is currently reachable end-to-end at all** — the real backend requires a password on employee creation, but the current frontend form collects no password field, suggesting the real create-employee flow may already be broken/unused today (masked by the page still running entirely on mock data). Worth confirming before scoping the Section D rework.
4. **Whether any employees have ever been created via the real (non-mock) `POST /employees` endpoint in a live environment** — if so, those `usm_users` rows already carry real login credentials that would need explicit handling (not silent removal) when employee login is retired.

---

**Again: this was an inspection-only exercise. Zero code, file, database, or schema changes were made.**
