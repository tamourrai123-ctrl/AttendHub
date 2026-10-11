# Employee / User Data Audit — Read-Only Inspection Report

Scope: full backend (`backend/src/**`, Prisma schema, e2e tests, one-off scripts) and full frontend (`frontend/src/**`). No code, schema, database, or test files were modified. This is a second, more detailed pass over the same codebase covered in the earlier auth/RBAC report and the employee-portal report delivered earlier in this session — findings below are consistent with those, reorganized into the format requested.

---

## Employee Architecture Status

Today, employees are not a separate concept at all — an "employee" is just a row in `usm_users` (the same table Super Admin and Company Admin accounts live in) that lacks the `is_admin`/`super_admin` flags. That one fact is the reason employee login, employee data, and admin accounts are currently tangled together, and it's the central thing this audit traces end to end.

The good news: Attendance, Leave, and Reports already treat "employee" as a free-standing data identifier (a plain `employeeId` string), not as a login account — so the future HR → Portal → Mobile flow is not blocked by those modules. The gap is entirely in the Employees module itself (which still issues logins) and in the frontend (which still runs on disconnected mock data).

---

## ✅ Already exists

- Two-table tenant/account model (`usm_company` + `usm_users`) with company-scoped composite keys, already serving all three current roles.
- A real, working `is_admin` / `super_admin` flag convention that already distinguishes Company Admin and Super Admin from a plain user row — the same convention `PrismaEmployeesRepository`, `PrismaUsersRepository`, and `PrismaCompaniesRepository` all reuse consistently.
- A real, DB-backed session table (`usm_user_sessions`, session revocation on logout/reset/change-password) — role-agnostic, not employee-specific.
- Read-only Attendance and Leave modules that already identify people by a plain `employeeId` string with **no foreign key to `usm_users`** — i.e., the "identify an HR employee without an AttendHub login" pattern the future architecture needs already exists structurally today (currently backed by in-memory mock data, not a real table yet).
- A Reports module that aggregates purely off Attendance data — no direct employee-auth dependency.
- An Integration Gateway foundation: `integration_master` (per-company integration config), `integration_detail` (endpoint definitions), `integration_field_mapping` (source→target field transforms) — the actual pipeline plumbing the future "HR software → Field Mapping → Portal" flow would run through.
- Company-level **mobile/attendance policy columns already present on `usm_company`**: `geo_fencing`, `wifi_validation`, `selfie_mandatory`, `mock_gps_detection`, `developer_options`, `default_geo_radius`, `offline_attendance_allowed`, `break_flag`, `time_zone`, `latitude`, `longitude`, `auto_logout`, `no_of_users`, `account_type`. These look like they were added in anticipation of a mobile attendance app, but **no backend or frontend code anywhere reads or writes any of these columns today** — confirmed by a full-repo search. They are schema-only placeholders right now.
- `email_verify_token_hash`/`reset_token_hash` single-use, hashed, time-limited tokens for verify-email/forgot-password — generic, not employee-specific, works the same for any role.

## ⚠️ Exists but needs changes

- **`POST /employees` requires a password field and writes it straight to `usm_users.c_password`.** This is the single biggest issue in the whole audit: today, "add an HR employee" and "create an AttendHub login" are literally the same write. `CreateEmployeeDto.password` is required and documented as "Hashed with bcrypt" — there is no way to add an employee record without it.
- **`PATCH /employees/:id` can also change that same password** as part of what's otherwise an HR-data edit (name/email/phone). The service does avoid logging the raw value (`passwordChanged: true` flag only), but the capability itself conflates HR-data editing with credential management.
- **Frontend Employees feature is fully disconnected from the real API.** `pages/company/Employees.tsx`, `EmployeeFormModal.tsx`, and `EmployeeDetailsDrawer.tsx` all still call `mockEmployeeService.ts` / `mock/employees.ts`, never the real `/employees` endpoints. Its `Employee` type has fields (`employeeCode`, `department`, `designation`, `status`, `joinedAt`) that **don't exist anywhere in the real backend**, and its create/edit form **collects no password at all** — meaning even if it were pointed at the real API today, it couldn't successfully create an employee (the real endpoint would reject the missing required password).
- `isPlainEmployeeRow()` (`is_admin !== 'Y' && super_admin !== 'Y'`) is a reasonable stopgap for "is this row an employee," but it means employee identity is inferred from the absence of admin flags on a shared login table rather than being its own concept. Fine for now; should not be the permanent design once a real HR-employee table exists.
- Audit-log actor-name resolution (`EmployeesController`, `PlansController`, and three other controllers) calls `InMemoryUsersRepository.findById()`, which only recognizes the three hardcoded demo accounts — any real account's system-log entries show a raw id instead of a name. Not employee-specific, but touches the same legacy repository the EMPLOYEE demo account lives in.

## ❌ Missing

- **No real, DB-backed Attendance or Leave tables** — both are still `InMemory*Repository` mock data (read-only, no create/update/delete anywhere in either module). Nothing to migrate away from here, but nothing to build the real HR sync onto yet either.
- **No mobile app code anywhere in this repository.** Confirmed by a full-text search for `mobile`/`biometric`/`device_id` across both backend and frontend — every hit is either UI terminology ("mobile menu" nav drawer) or a doc comment referencing an external, pre-existing mobile app. There is no mobile-facing controller, DTO, auth strategy, or device-identifier field anywhere in the code.
- **No employee-facing leave-request or attendance-check-in endpoint** — by design; doc comments in the Leave module state this functionality lives in "the existing mobile app," but since no mobile app code exists here, how that app currently authenticates or identifies an employee is entirely unknown from this codebase.
- **No dedicated HR-employee table separate from `usm_users`.** Employee HR data and employee login credentials occupy the exact same row today.
- **No frontend signup, reset-password, change-password, or email-verification pages** (from the earlier auth inspection — still true, not employee-specific, but relevant since the auth flow overall is thinner on the frontend than the backend).
- **No rate-limiting on `/auth/login`.**

## 🗑️ Can eventually be removed

Only once the corresponding rework/migration steps below happen first — nothing here should be deleted yet:

- `Role.EMPLOYEE` enum value and every `@Roles(Role.EMPLOYEE)` usage (`GET /me`, `GET /attendance/me`).
- `MeController` (`employees/me.controller.ts`) in its entirety.
- The `employeeId` field on `AuthenticatedUser` and `usm_user_sessions`, once nothing populates it for login purposes.
- The `employee@tamotam.test` demo account and its login fallback in `InMemoryUsersRepository` — **but this is currently load-bearing for other still-mock modules and at least one e2e suite**, so it cannot go first (see Dependency Map).
- Frontend `/user/*` route tree (`Dashboard.tsx`, `Attendance.tsx`, `Leave.tsx`, `Profile.tsx`), `UserLayout.tsx`, and the `EMPLOYEE` entries in `lib/permissions.ts`.
- `backend/src/employees/repositories/in-memory-employees.repository.ts` — **already dead code today**, confirmed not instantiated anywhere (`employees.module.ts` only wires the Prisma repository). Safe to remove independently of everything else, any time.
- EMPLOYEE-role test cases in `employees.e2e-spec.ts` and `auth-rbac.e2e-spec.ts`, once the endpoints they test are gone.

## 🔒 Password/security findings

- Passwords are hashed with **bcryptjs, cost factor 12**, everywhere a password is created or changed (signup, employee creation, password reset/change) — never stored or transmitted in plaintext, never logged (the employee-update audit log deliberately logs `passwordChanged: true` instead of the value).
- Password hashes (`c_password`) are **never returned in any API response** — `Employee`/`AuthUserProfile` response shapes both exclude it explicitly.
- Reset and email-verification tokens are single-use, SHA-256-hashed at rest (`reset_token_hash`, `email_verify_token_hash`), time-limited, and cleared immediately on use. `forgot-password` always returns the same generic message regardless of whether the email matched (no account-enumeration signal).
- Resetting or changing a password **revokes every active session** for that user — a sensible default, applies to every role uniformly, not employee-specific.
- **The core conflict with your intended architecture**: today the portal (not the HR system) is the party that creates and stores the employee's login credential — `POST /employees` requires a caller-supplied password and the portal bcrypt-hashes and stores it. The portal does *not* currently know or store any *plaintext* password (that's never persisted or logged), but it **does mint the credential in the first place**, which conflicts with "HR system remains the source of employee credentials." This is exactly the piece that needs to be removed/reworked for that target architecture to hold.
- Default JWT secret (`configuration.ts`) falls back to the literal string `'change-me'` if `JWT_SECRET` isn't set in the environment — worth confirming the real `.env` overrides this, though not employee-specific.

## 📱 Mobile-related findings

- **No mobile app code exists in this repository at all** — no mobile auth endpoint, no device-identifier field, no biometric handling, nothing. Every "mobile" hit in the codebase is either responsive-UI terminology (hamburger menu / drawer) or a doc comment.
- **`usm_company` already has 13 mobile/attendance-policy columns** (geofencing, WiFi validation, selfie-mandatory, GPS-mock detection, developer-options lockout, default geo-radius, offline-attendance toggle, break tracking, time zone, lat/long, auto-logout, seat count, account type) — these exist in the database schema but are **completely unused by any application code today**. This strongly suggests a mobile attendance app was planned or exists as a separate, not-yet-integrated codebase, and that this portal's database was set up to eventually configure it per company.
- Comments in the Leave module (`leave.controller.ts`, `mockLeaveService.ts`, `mock/leave.ts`) and the frontend's `pages/company/Leave.tsx`/`pages/user/Leave.tsx` all describe "the existing mobile app" as the system that actually handles employee leave requests (and by extension, likely attendance check-in) — treated here as an external fact, not something this codebase implements or can verify.
- **Open question, not answerable from this codebase**: does that external mobile app currently authenticate against this same `/auth/login` endpoint using an `EMPLOYEE` `usm_users` row, or does it have an entirely separate auth mechanism? This matters a great deal for sequencing the EMPLOYEE-role removal safely.

## 🔄 HR → Portal sync readiness

Mapping the intended flow against what exists:

| Stage | Status |
|---|---|
| External HR Software | Outside this codebase — nothing to inspect |
| HR Integration Endpoint | ✅ Exists — `integration_master`/`integration_detail` model a generic per-company integration with configurable endpoints (method, request/response type) |
| Field Mapping | ✅ Exists — `integration_field_mapping` (source path → target field, transform type/config) is a real, working table with its own controller (`field-mappings.controller.ts`) already RBAC-gated to Company Admin/Super Admin (EMPLOYEE explicitly has no access) |
| Portal Backend receiving data | ❌ Missing — nothing currently *consumes* an integration's field mappings to actually pull/transform real HR employee data; the plumbing exists, the sync job does not |
| Portal Employee Data (stored) | ⚠️ Exists, but wrong shape — employee data lives in `usm_users`, entangled with login credentials, and the frontend's own employee data model doesn't even match the backend's |
| Mobile App consuming employee data | ❌ Missing — no mobile app code in this repository at all |
| Employee Attendance (from mobile) | ⚠️ Partially exists — Attendance module can already represent this shape (free-standing `employeeId`, no login dependency), but is mock/read-only, not wired to any real ingestion path |

**Bottom line:** the integration/field-mapping foundation is real and already built; what's missing is (1) an actual sync job that uses it to pull HR data in, (2) a proper home for that data that isn't `usm_users`, and (3) the mobile app itself, which doesn't exist in this repo.

## 🗄️ Database findings

**`usm_users`** — one row per login-capable account (Super Admin, Company Admin, and today, Employee too). Composite PK `(company_id, user_id)`.

| Field | Purpose | Used by portal? | Needed for HR sync? | Needed for mobile? | Recommendation |
|---|---|---|---|---|---|
| `company_id`, `user_id` (PK) | Row identity, tenant scoping | Yes, all roles | Yes — however employee identity ends up being modeled, tenant scoping is still needed | Indirectly | Keep — structural |
| `user_name` | Display name | Yes, all roles | Yes — this is HR data (employee's name) | Yes, likely | Keep — this is data, not a login-only field |
| `c_password` | Login credential (bcrypt hash) | Yes, for Super Admin/Company Admin login | No | No | Keep for Super Admin/Company Admin; **stop writing this for employees** once `POST /employees` no longer requires a password |
| `email_address` | Login identifier + contact field, globally unique | Yes, all roles | Yes, as contact info | Possibly | Keep — dual purpose, not employee-only |
| `phone` / `mobile` | Contact fields | Optional, all roles | Yes | Possibly | Keep — HR data |
| `skype` | Contact field | Optional, all roles | Unlikely | No | Keep as-is; unused by any current employee-specific logic, not worth touching in this audit |
| `is_admin` | Marks Company Admin | Yes — load-bearing for role derivation | N/A | N/A | Keep — required for all three roles' derivation today |
| `super_admin` | Marks Super Admin | Yes — load-bearing | N/A | N/A | Keep |
| `account_locked` | Login lockout flag | Yes, generic | No | No | Keep — never actually set to `'Y'` by any code path today (no auto-lockout logic exists), but the check is honored if set manually |
| `email_verified` + token/expiry | Email verification | Yes, generic | No | No | Keep — not employee-specific |
| `reset_token_hash` + expiry | Password reset | Yes, generic | No | Only if employees keep a login | **Employee relevance drops to zero** once employee login is retired |

**`usm_company`** — one row per tenant, PK `id` VARCHAR(2) (caller-generated, no DB sequence). Beyond the previously-reported fields (`title`/`shortname`/`country`/`status`/`pid` self-reference for a company hierarchy nothing yet reads), this pass found a full set of **mobile/attendance policy columns** (`geo_fencing`, `wifi_validation`, `selfie_mandatory`, `mock_gps_detection`, `developer_options`, `default_geo_radius`, `offline_attendance_allowed`, `break_flag`, `time_zone`, `latitude`, `longitude`, `auto_logout`) plus `no_of_users` (seat count) and `account_type` (Char code, default `'D'`) — all currently unused by any code. Also two oddly-placed single fields, `employee_name` and `department_name` (VARCHAR, nullable) directly on the company row — these don't fit the "one company, many employees" model at all and their intended use is unclear (see Uncertainties).

**Company ↔ Users relationship**: one company can have multiple `usm_users` rows; nothing in the schema or code restricts a company to exactly one Company Admin (a diagnostic script, `inspect-usm-users-flags.ts`, exists specifically to verify this "exactly one admin" assumption against live data — its presence tells us this was an open question during development, not a hard guarantee). Employees and admins are **not** distinguishable by any FK or separate table — only by the `is_admin`/`super_admin` flag values on the same row shape.

**`usm_user_sessions`** — deliberately **not** foreign-keyed to `usm_users` (confirmed directly in the script that created it: `add-real-authentication-columns.ts`). This is intentional — it lets the same sessions table serve both real DB-backed users and the three legacy demo accounts (whose fake ids like `cmp_001`/`emp_001` don't fit the real `company_id` VARCHAR(2) column). `company_id`/`employee_id` here are unenforced VARCHAR(20) columns, wider than the real `usm_company.id` VARCHAR(2), specifically to accommodate those legacy demo values.

**Attendance/Leave tables**: no Prisma model exists yet for either — both are pure in-memory mock arrays keyed by a free-standing `employeeId` string (e.g. `'emp_001'`), with zero foreign-key relationship to `usm_users`.

**Integration tables** (`integration_master`, `integration_detail`, `integration_field_mapping`): all scoped by `company_id`, no employee dependency at all.

**Convention worth knowing**: per this project's own script comments, **PostgreSQL is manually managed and Prisma only introspects** — i.e. `schema.prisma` reflects the database, it isn't the source of truth driving migrations. New columns are added via hand-written, idempotent DDL scripts (see `add-real-authentication-columns.ts`), not `prisma migrate`. This matters for section 13 below: there is no committed migration history to trace, only the current introspected shape plus these one-off scripts.

## 🎨 Frontend findings

| Area | Files | Category |
|---|---|---|
| Employee management by Company Admin | `pages/company/Employees.tsx`, `pages/company/employees/EmployeeFormModal.tsx`, `pages/company/employees/EmployeeDetailsDrawer.tsx` | **A — must keep, needs rework.** Still 100% mock-backed (`mockEmployeeService.ts`, `mock/employees.ts`); form fields don't match the real backend contract; no password field despite the real endpoint requiring one. |
| Employee self-service/login | `pages/user/Dashboard.tsx`, `Attendance.tsx`, `Leave.tsx`, `Profile.tsx`, `layouts/UserLayout.tsx` | **B — safe to remove later.** Entire employee portal shell, gated by `user.employeeId`. |
| Employee mobile-related functionality | None found in the frontend beyond doc comments describing an external app | **C — nothing to categorize; doesn't exist here.** |
| Mock/demo-only functionality | `mock/employees.ts` (8 seed employees, mock-only shape with `employeeCode`/`department`/`designation`/`joinedAt`), `mock/users.ts` (`employee@tamotam.test` demo account + `DEMO_CREDENTIAL_HINTS` surfaced on the Login page), `services/mockEmployeeService.ts` | **D — mock-only, retire once the real migration happens.** |
| Shared/role config | `lib/permissions.ts` (`ROLE_PERMISSIONS.EMPLOYEE`, `ROLE_HOME_ROUTE.EMPLOYEE`), `lib/statusBadges.ts` (`EMPLOYEE_STATUS_BADGE`/`LABEL` — this one is about an employee's active/inactive *data* status, not their login role, so it's category A, not B), `routes/AppRoutes.tsx`, `types/auth.ts` (`UserRole` includes `"EMPLOYEE"`) | Mixed — role-routing parts are B, employee-data-status parts are A |

## 🔐 Auth/RBAC findings

Full flow, confirmed by direct code read:

`Login.tsx` (email/password form) → `POST /auth/login` (public) → `PrismaUsersRepository.findByEmail()` looks up `usm_users` case-insensitively across all companies → bcrypt compare against `c_password` → falls back to 3 hardcoded demo accounts only if no real row matched → checks `account_locked`, then company `status` (deliberately after password verification, so a wrong password never leaks account existence) → issues a signed JWT **and** a `usm_user_sessions` row (token stored as SHA-256 hash only) → frontend `AuthContext` calls `GET /auth/me` to confirm the session, then redirects by role (`ROLE_HOME_ROUTE`) → every subsequent request goes through the two global guards, `AuthGuard` (identity: JWT verify + DB session lookup) then `RolesGuard` (authorization: `@Roles(...)` check against `request.user.role`).

Role derivation is identical everywhere it happens (`PrismaUsersRepository`, `PrismaEmployeesRepository`, `PrismaCompaniesRepository` all reuse the same `is_admin`/`super_admin === 'Y'` convention): `super_admin='Y'` → `SUPER_ADMIN`; else `is_admin='Y'` → `COMPANY_ADMIN`; else → `EMPLOYEE`.

`Role.EMPLOYEE` currently gates exactly two endpoints: `GET /me` and `GET /attendance/me`. It's explicitly *rejected* (403) from `/employees/*` and from the integration field-mappings endpoints (confirmed by that controller's own doc comment: "EMPLOYEE has none (the @Roles guard rejects it before any handler runs)").

Frontend-side, `ProtectedRoute`/`AppRoutes` do a parallel role check for UX routing only — the code's own comment is explicit that this is not a security boundary, the backend's `RolesGuard` is what actually enforces it.

## 🔗 Dependency map

```text
EMPLOYEE (Role enum value)
├── Backend
│   ├── AuthGuard / RolesGuard        — checked on every request; EMPLOYEE is a valid value but not special-cased
│   ├── @Roles(Role.EMPLOYEE)
│   │   ├── GET /me                   (MeController)
│   │   └── GET /attendance/me        (AttendanceController)
│   ├── AuthenticatedUser.employeeId  — populated only when role === EMPLOYEE
│   ├── usm_user_sessions.employee_id — populated only for EMPLOYEE sessions
│   ├── PrismaUsersRepository.toProfile() — derives EMPLOYEE as the "neither flag is Y" fallback
│   ├── PrismaEmployeesRepository.isPlainEmployeeRow() — same fallback logic, different repository
│   ├── InMemoryUsersRepository       — hardcodes employee@tamotam.test / employee123
│   │   └── still a live login fallback + used by 5 controllers just to resolve actor names for audit logs (Employees, Companies, Integrations, Endpoints, Field Mappings) — NOT employee-specific on its own, but the demo employee account rides along with it
│   ├── employees.e2e-spec.ts         — EMPLOYEE_SELF_TOKEN fixture, tests /me-style access
│   └── auth-rbac.e2e-spec.ts         — login-as-EMPLOYEE, /me, /attendance/me, 403-on-/employees cases
├── Frontend
│   ├── types/auth.ts (UserRole)
│   ├── lib/permissions.ts (ROLE_PERMISSIONS.EMPLOYEE, ROLE_HOME_ROUTE.EMPLOYEE)
│   ├── routes/AppRoutes.tsx / ProtectedRoute.tsx — role-based redirect
│   ├── layouts/UserLayout.tsx
│   ├── pages/user/{Dashboard,Attendance,Leave,Profile}.tsx
│   └── mock/users.ts — MOCK_ACCOUNTS.employee, DEMO_CREDENTIAL_HINTS (surfaced on Login page)
└── NOT dependent on EMPLOYEE role at all (confirmed independent)
    ├── Attendance (Company Admin view) — keys off free-standing employeeId string, no usm_users FK
    ├── Leave (Company Admin view) — same pattern
    ├── Reports — aggregates Attendance data only
    ├── Employees module's core CRUD concept (Company Admin managing HR records) — only its password-writing side effect is coupled to login
    └── Integration/Field-Mapping module — explicitly rejects EMPLOYEE, no other coupling
```

---

## Recommended Next Step

**Rework `POST`/`PATCH /employees` to stop requiring or writing a password**, and fix the frontend Employees form to match the real backend contract, in the same change — these two are already tightly coupled (the frontend has no password field today; the backend requires one), so tackling them together is the smallest safe unit of work that starts decoupling "HR employee record" from "AttendHub login account," without touching RBAC, Attendance, Leave, or any table structure yet.

*(Not implemented — this is a recommendation only, per the read-only scope of this audit.)*
