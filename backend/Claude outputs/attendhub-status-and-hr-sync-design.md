# AttendHub — Current Project Status + HR Integration → Employee Sync Contract

This is a read-only inspection and design report. No source files, schema, or database records were touched while producing it — see the confirmation at the end.

A note on method: the task's own status summary was treated as a hypothesis, not a fact sheet, per its own instruction. Every claim below was checked directly against the code running on your machine (module wiring, DTOs, repositories, schema.prisma), not against comments in that code either — several in-code comments turned out to be stale (for example, `app.module.ts` still says "every domain module below still runs on its existing in-memory repository," which is no longer true for four of the nine feature modules). Where the actual code contradicts the task summary or its own comments, this report says so explicitly.

---

## 1. Current Project Status

**Completed and verified against real, Postgres/Prisma-backed storage:** Company management (`usm_company` via `PrismaCompaniesRepository`), Employee CRUD (`usm_users` via `PrismaEmployeesRepository`, credential-decoupled as of the immediately preceding phase), admin/employee authentication and sessions (`usm_users` + `usm_user_sessions` via `PrismaUsersRepository`/`PrismaSessionsRepository`, real bcrypt + JWT + revocable DB sessions), and the entire HR Integration configuration foundation — `integration_master`, `integration_detail`, and `integration_field_mapping`, all three fully Prisma-backed with real repositories, services, controllers, and RBAC.

**Partially completed / real backend but mock frontend:** the Integrations feature is the clearest case of this split. The backend is completely real (see section 4), but `frontend/src/pages/control/Integrations.tsx` still imports from `services/mockIntegrationService` and `types/integration`, and there is no `frontend/src/api/integrations.ts` file at all — confirmed by listing the frontend's `api/` directory, which contains only `auth.ts`, `client.ts`, `companies.ts`, `employees.ts`, and `session.ts`. The Integrations frontend page has not been connected to the real backend that already exists for it.

**Still in-memory (mock, non-persistent) despite having a real table already defined in `schema.prisma`:** three modules fall into this specific, easy-to-miss category — a real table exists, but the module's own `@Module()` provider list still wires up its `InMemory*Repository`, not a Prisma one:
- **System Logs** — `system_logs` table exists in the schema; `SystemLogsModule` still provides only `InMemorySystemLogsRepository`. Every audit-log entry this whole application writes (including the credential-safety guarantees from the immediately preceding phase — "no password ever reaches system_logs") is currently held in an in-process array and is lost on every restart. This matters a great deal for HR sync, which will need a durable audit trail.
- **Monitoring** — `api_logs` table exists; `MonitoringModule` still provides only `InMemoryMonitoringRepository`.
- **Pricing** — `pricing_master`/`pricing_detail` tables exist; `PricingModule` still provides only `InMemoryPlansRepository`.

**Still in-memory with no backing table at all (by design, not by omission):** Attendance and Leave. `AttendanceModule`/`LeaveModule` wire up `InMemoryAttendanceRepository`/`InMemoryLeaveRepository`, and there is no `attendance` or `leave` table anywhere in `schema.prisma`. Both are explicitly read-only at the code level — `AttendanceService`'s own doc comment states "No method here can create, update, or delete a record; that's enforced structurally (the repository has no such methods), not just by omission from the controller" — and both repositories store denormalized records (`employeeId`, `employeeCode`, `employeeName`, `companyId` all inline on every row) rather than a foreign key into `usm_users`. This was a deliberate choice recorded in the codebase's own history, not an oversight this task should correct.

**Not started anywhere in the repository:** HR → AttendHub employee/attendance/leave synchronization of any kind (the `HRProvider` interface exists as a documented seam with zero implementations — see section 4), any dedicated HR-employee storage or mapping table, employee-facing HR-backed authentication, and a mobile application (there is no mobile project, React Native or otherwise, anywhere in this repository — this report does not assume anything about one).

**Known, pre-existing, explicitly out-of-scope gaps** (found during inspection, not introduced by this task, and not something this report recommends fixing now): five controllers (`Employees`, `Companies`, `Integrations`, `Endpoints`, `FieldMappings`) resolve the acting user's display name for audit logs via `InMemoryUsersRepository.findById(user.userId)`, but real signed-up users only exist in `PrismaUsersRepository` — so audit-log entries for real (non-demo) users currently show a raw id instead of a name. This is documented in `auth.module.ts`'s own comment as a known, deferred gap.

## 2. Remaining Project Roadmap

| Area | Current Status | Remaining Work |
|---|---|---|
| Admin authentication | Implemented, real DB + JWT + revocable sessions | Resolve the actor-display-name gap for real users in audit logs (pre-existing, deferred) |
| Company management | Implemented, real DB | None identified beyond product-specific polish |
| Employee CRUD | Implemented, real DB, credential-decoupled | HR synchronization |
| Employee credential separation | Implemented (random placeholder hash, never a real credential) | Eventually remove the placeholder once HR-backed auth replaces it (see section 9) |
| Employee frontend | Real API (`api/employees.ts`) | `Dashboard.tsx`/`Profile.tsx` still read employee data through the mock service — not migrated |
| HR integration foundation (backend) | Implemented, real DB, real gateways/executor | Employee sync logic itself; also see the next row |
| HR integration foundation (frontend) | **Not connected** — page is still 100% mock | Build a real `api/integrations.ts` and wire the Integrations/Endpoints/Field Mappings pages to it |
| HR field mapping | Foundation implemented (stateless engine + persisted records) | An employee-specific sync contract that decides *when* and *how* mappings get applied (section 6/7) |
| HR employee storage | Not implemented | Determine final storage architecture (section 10) |
| HR → employee sync | Not implemented at all — no code path exists | Design (this report), then implementation |
| Employee HR authentication | Not implemented | Design mobile/authentication flow (section 9) |
| Mobile app | Not present in repository | Future implementation — cannot be assumed or designed against; the repository has no mobile project |
| Attendance persistence | Explicitly in-memory, no schema table, read-only by design | Future DB-backed implementation, ideally after HR employee identity is settled |
| Leave persistence | Explicitly in-memory, no schema table, read-only by design | Future DB-backed implementation |
| Reports | Existing, built entirely on `AttendanceService` | Will need to evolve once Attendance is DB-backed |
| Monitoring | In-memory despite `api_logs` table existing | Wire to the real table (unrelated to HR sync, noted for completeness) |
| Pricing | In-memory despite `pricing_master`/`pricing_detail` tables existing | Wire to the real tables (unrelated to HR sync, noted for completeness) |
| System logs | **In-memory despite `system_logs` table existing** | Should be prioritized before HR sync goes live — sync needs a durable audit trail |
| Employee role removal | Not done, not attempted | Only after replacement (HR-backed) authentication exists and is verified end to end |

## 3. Current Employee Architecture

An employee is a row in `usm_users`, the same table that holds Company Admin and Super Admin login rows, distinguished only by the `is_admin`/`super_admin` VARCHAR(3) flags (`isPlainEmployeeRow()` in `PrismaEmployeesRepository` is the one place this convention is applied). There is no separate `employees` table.

`CreateEmployeeDto`/`UpdateEmployeeDto` accept exactly `name`, `email`, `phone?`, `mobile?` — nothing else, and there is no `password` field on either. `usm_users.c_password` is `NOT NULL` with no database default, so `PrismaEmployeesRepository.create()` writes a bcrypt hash of 32 cryptographically random bytes (`generateRawToken()`) into it purely to satisfy that constraint. This value is discarded from memory immediately after hashing, is never returned by any endpoint, is never logged, and — because nobody, including AttendHub itself, ever knows the plaintext — cannot succeed against `AuthService.login()`'s bcrypt comparison in practice. It is explicitly documented in the repository's own code as "a temporary database-compatibility mechanism only, not a second credential authority," and it is never touched again by `updateInCompany()`.

Despite this, the `EMPLOYEE` role and its supporting authentication path are fully live and untouched: `Role.EMPLOYEE` exists in the role enum, `AuthenticatedUser.employeeId` and `Session.employeeId` are populated whenever a session's role is `EMPLOYEE`, `MeController` (`GET /me`) and `AttendanceController`'s `GET /attendance/me` both work and self-scope from the session (never a client-supplied id), and `usm_user_sessions.employee_id` is a real, populated column. In practice, the only way to actually *experience* the Employee role today is the legacy hardcoded demo account that `AuthService.login()` still accepts as a documented fallback (see `auth.module.ts`'s comment) — a real, signed-up-through-the-API employee row cannot currently log in for real, because nobody knows its `c_password` placeholder. This is a direct, useful consequence of the credential-decoupling work: it makes explicit that portal-issued employee credentials do not exist right now, by construction, not by policy alone.

Tenant isolation is enforced by scoping every employee query to `(company_id, user_id)` — the composite primary key — and always taking `company_id` from the authenticated session (`@CurrentUser()`), never from the request body or URL.

## 4. Existing HR Integration Capabilities

This is substantial and directly reusable. Configuration lives across three real tables:

- `integration_master` (one row per configured HR/API connection per company): `integration_type`, `auth_type`, `base_url`, and two generic credential columns, `api_key`/`api_secret`. Composite PK `(company_id, id)`. CRUD is Super-Admin-only for create/list; Company Admin and Super Admin can both read/update/delete a specific company's own integration.
- `integration_detail` (one row per configured endpoint under an integration): `endpoint` (a relative path, optionally with `{{name}}` placeholders filled in at call time), `http_method`, `request_type`/`response_type`, `sort_order`, `status`. Both Company Admin and Super Admin can manage a company's own endpoints.
- `integration_field_mapping` (one row per configured field-transform rule under an endpoint): `source_path` (structural, e.g. `data[].employee_id`), `target_field`, `transform_type` (one of a fixed, safe set — `NONE`/`TRIM`/`UPPERCASE`/`LOWERCASE`/`TO_STRING`/`DATE_ISO`/`VALUE_MAP`/`DEFAULT_IF_EMPTY` — never an evaluated expression or script), `transform_config` (validated per type before every write).

Behind these tables: `IntegrationGatewayFactory` dispatches to `ApiKeyGateway` (sends `api_key` as an `X-API-Key` header), `BasicAuthGateway` (Base64s `api_key:api_secret`), and `OAuth2Gateway` (client-credentials grant against a token URL resolved from a reserved-name sibling endpoint row, since there is no dedicated token-URL column). `IntegrationEndpointExecutorService` ties it together: resolves credentials internally (never crossing the API boundary), validates `auth_type` against a real LOV table, builds the URL, and makes one `fetch()` call with a 15-second timeout — synchronously, on demand, when an admin clicks "test" or an as-yet-unbuilt caller invokes it programmatically. `ResponseFieldDetectorService` walks a sample JSON body and reports its structural shape (`data[].employee.email`) so an admin can build mappings without knowing the API in advance. `FieldMappingService` is the single, stateless transformation engine — used identically whether a mapping came from a one-off preview call or a persisted `integration_field_mapping` row — and its `applyToResponse()` method already does almost exactly what employee-list sync would need: given a full response body and a mapping set, it finds the shared array prefix, unwraps it, and maps every element.

What is explicitly missing, confirmed by direct inspection rather than inference: there is no code path anywhere that calls `IntegrationEndpointExecutorService.execute()` except a manual "test" click from a controller — nothing schedules or chains calls automatically. There is no pagination handling in the executor (one `fetch()`, whatever the endpoint returns, no "follow `next_page` and keep going" logic). There is no persistence of anything the executor fetches — a test call's response is returned to the caller and then simply discarded. There is no retry logic, no dead-letter/failure-queue concept, and no webhook receiver of any kind. `backend/package.json` has no `@nestjs/schedule`, no queue library (Bull/BullMQ/Agenda), and no cron dependency at all — scheduled or event-driven sync would need a new dependency, not just new code. The `HRProvider` interface (`getEmployees()`/`getAttendance()`/`getLeave()`) exists specifically as the intended seam for a vendor-specific adapter, and its own doc comment says plainly: "No concrete implementation of this interface exists yet." `IntegrationsService`'s own comment confirms the same thing from the other side: "Deliberately has NO method that reaches out to a real HR system... no such adapter is written yet."

## 5. HR Employee Identity Strategy

Three realistic options, in order of recommendation:

**Recommended — a dedicated external-identity column pair on the employee record, not a guess from existing fields.** Add (in a later phase, not now) something equivalent to `external_employee_id` (the HR system's own opaque identifier for that person) plus `integration_id` (which configured HR connection it came from), and require the combination `(company_id, integration_id, external_employee_id)` to be unique. This is the only approach that is actually safe: an HR system's own ID is the one thing that is guaranteed stable across a person's employment (email addresses change on marriage or personal preference; phone numbers change; employee codes get reassigned after someone leaves and is replaced). It is also the only option that supports the same person existing in two different HR-connected systems for two different companies without collision, and it makes "this specific HR system's employee #4471" an unambiguous, permanent key regardless of what AttendHub itself calls that same person.

**Usable as a secondary match key, never as the primary one — email.** Useful for a one-time "does this look like an employee we already have" heuristic during the very first sync (before any `external_employee_id` has been recorded), but not safe as an ongoing identity key: emails are user-editable in most HR systems, and matching on email risks silently merging two different people who happen to share an address (a shared department mailbox, for instance) or silently splitting one person into two records after an email change goes unnoticed by a sync that doesn't also track the external ID.

**Not recommended — employee code/number, or any AttendHub-generated internal id, as the join key.** These are stable within AttendHub's own database but say nothing about the HR system's own record, so there is no way to detect "this external record used to map to internal id 41 and now needs to map to internal id 41 again" without already having stored that mapping somewhere — which just reintroduces the need for an external-id column, only implicitly and less safely.

**Explicitly ruled out, per the task's own instruction and this report's independent judgment: never use a password, password hash, or any credential-derived value as identity.** Credentials are erasable, rotatable, and — in AttendHub's case — currently a random, discarded placeholder with no relationship to the person at all; they carry zero identity information and must never be treated as if they did.

A composite mapping table (option three under section 10's storage comparison) is the natural home for this identity data if/when the storage decision in section 10 favors it; if the storage decision instead extends `usm_users` in place, the same two columns would live there directly.

## 6. Employee Data Contract

Field-by-field, mapped through the terms this codebase already uses:

| HR field (conceptual) | AttendHub field | Owner | Notes |
|---|---|---|---|
| External employee ID | *(new, not yet modeled)* — `external_employee_id` | HR | Identity key (section 5); never overwritten by anything but a sync |
| Full name | `usm_users.user_name` / `Employee.name` | HR (once sync exists) | Currently Company-Admin-editable; ownership question addressed in section 8 |
| Email | `usm_users.email_address` / `Employee.email` | HR (once sync exists) | Same ownership caveat as name; also the login-lookup key for auth (`PrismaUsersRepository.findByEmail`) — changing it via sync has auth implications worth flagging as its own open question (section 18) |
| Phone | `usm_users.phone` / `Employee.phone` | Shared / HR-preferred | Already nullable and optional on create |
| Mobile | `usm_users.mobile` / `Employee.mobile` | Shared / HR-preferred | Already nullable and optional on create |
| Active/status (employment status) | *(does not exist on `usm_users` today)* | HR | Would need a new column or a repurposed one (`account_locked` is semantically different — it is an AttendHub login-lock flag, not an HR employment-status flag, and reusing it would conflate two unrelated concepts) |
| Department | *(does not exist on `usm_users` today; `usm_company.department_name` exists but is a single unused per-company string, not a per-employee field)* | HR | New field required |
| Designation/job title | *(does not exist)* | HR | New field required — `HRProviderEmployee.jobTitle` in the existing interface already anticipates this |
| Joining date | *(does not exist)* | HR | New field required |
| Employee credential/password | Never mapped to anything AttendHub stores meaningfully — see section 9 | HR exclusively | The `c_password` placeholder is sync metadata about the database, not employee data, and must never be a sync target |
| Sync metadata (last-synced-at, source integration, sync status/error) | *(does not exist anywhere yet)* | AttendHub | New, and necessary — see sections 8 and 14 |

The columns marked "does not exist" are exactly the fields the *previous* phase deliberately kept out of the frontend/backend Employee type, because `usm_users` has no corresponding columns — this report is not contradicting that decision, it is naming precisely what a future schema change would need to add to carry them.

## 7. Create / Update / Deactivate Rules

**New HR employee** (an `external_employee_id` seen for the first time for this integration/company): create a new employee record, populate every HR-owned field from the mapped response, and set `external_employee_id`/`integration_id`/a "last synced at" timestamp. Continue writing the existing random placeholder hash into `c_password` at creation, unchanged from today's behavior — this report is not proposing any change to that mechanism (see section 9 for why).

**Existing HR employee, unchanged fields**: update `last_synced_at` (or equivalent) only; do not touch any data column, so a sync that finds nothing new produces no spurious audit-log noise and no unnecessary writes.

**Changed HR employee** (a mapped field's value differs from what AttendHub currently holds): apply the conflict-resolution policy from section 8 before writing anything — the default recommended there is that HR wins for HR-owned fields, but only after checking whether a Company Admin edit is pending (see section 8).

**Inactive/terminated HR employee**: never hard-delete. AttendHub's own `EmployeesService.remove()` already performs a real, permanent delete of the `usm_users` row today — that is the wrong behavior for a sync-driven deactivation, because Attendance and Leave records reference `employeeId` as a plain string with no foreign key, and deleting the employee row would silently orphan every historical attendance/leave record tied to that id (visible today only through denormalized `employeeName`/`employeeCode` fields, since neither module joins back to `usm_users`). A sync-driven "employee left the HR system" event should instead set a status/deactivated flag (which, per section 6, does not exist as a column yet) and continue excluding the employee from active-employee lists, while preserving the row and its history intact.

**Employee missing from an HR response entirely** (not explicitly marked inactive, just absent from the current sync's data — e.g., a paginated fetch that failed partway, or a filter change on the HR side): do not treat absence as termination. A sync that silently deactivates every employee it didn't happen to see this run is far more dangerous than a sync that does nothing to employees it can't currently account for. This should be logged as a discrepancy for a human to review, not acted on automatically, until there is a documented, deliberate way to distinguish "genuinely removed from HR" from "didn't come back in this particular response" (pagination failures, filtered queries, and partial outages all look identical to a naive "missing = terminated" rule).

## 8. Data Ownership / Conflict Resolution

```
HR owns:
  name, email, phone, mobile (once sync exists), department, designation,
  joining date, active/employment status, and the employee's real
  authentication credential (which AttendHub never stores at all — see
  section 9).

AttendHub owns:
  external_employee_id/integration_id linkage, sync metadata (last synced
  at, sync status/error), the c_password compatibility placeholder, and
  anything Attendance/Leave/Reports already generate independently
  (attendance/leave records themselves, which remain denormalized and
  identified by employeeId regardless of where that employee's HR data
  comes from).

Shared / contested:
  name, email, phone, mobile are the fields a Company Admin can currently
  edit through the existing Employees UI, and would also be the fields a
  sync would want to overwrite from HR. This is the actual conflict.
```

Company Admin edits happen today with no awareness that a sync might one day overwrite them a moment later — because no sync exists yet, this has never been a real conflict, but it will be the first real one the moment Phase C is implemented. Three policies are worth naming explicitly (this report does not pick one on your behalf, since it is a product decision, not a purely technical one — see section 18):

1. **HR always wins** (simplest, matches "HR is the source of truth" literally): every sync run overwrites the shared fields unconditionally. Risk: a Company Admin correction (e.g., fixing a typo HR hasn't fixed yet) is silently reverted on the next sync.
2. **Company Admin edit wins until the next HR change** (a "last write wins by timestamp" policy): requires tracking, per field or per record, when AttendHub's copy was last changed by a human versus by a sync, and only overwriting if the HR-side value has changed since the last sync — not just re-applying the same value. This is more correct but requires the sync-metadata columns from section 6 to exist first.
2. **HR wins only for fields not recently edited locally** (a hybrid, e.g. "don't overwrite a field a Company Admin touched in the last N days"): a compromise that avoids clobbering a very recent manual fix, at the cost of a policy that is harder to explain and reason about.

Whichever policy is chosen, it needs to be visible to the Company Admin — a silently-overwritten manual edit is a worse experience than a sync that clearly says "this field is HR-managed and was just updated from HR" or "your edit conflicts with HR's current value."

## 9. Credential / Authentication Architecture

```
HR employee password
        |
        v
   owned by HR
        |
        v
  validated by HR

AttendHub
        |
        v
  does NOT store the HR password
```

This boundary is already fully respected by the current implementation, and this report's recommendation is to keep it that way rather than weaken it in any future phase. `usm_users.c_password` currently holds a value with a very specific, narrow purpose: satisfying a `NOT NULL` database constraint, nothing else. It is not derived from, related to, or ever compared against the employee's real HR password.

For the placeholder to eventually become unnecessary, one of two things has to change, and both are schema/architecture changes explicitly out of scope for this design task:

1. **`usm_users.c_password` becomes nullable** (or is dropped from the employee-authentication path entirely once employees no longer authenticate through this table at all). This alone would remove the need for the placeholder, but only once nothing else depends on `c_password` being non-null for every row — a direct schema change, not something this report is authorizing or attempting.
2. **Employee authentication moves off `usm_users`/bcrypt entirely**, per the target architecture's own diagram: `Employee Mobile → AttendHub → External HR system → HR validates credentials`. In this model, AttendHub's role during employee login becomes "forward this credential check to the HR system and trust its answer" (via the same Integration Gateway already built for data sync — `IntegrationGatewayFactory`/`IntegrationEndpointExecutorService` are almost certainly the right building blocks to reuse, once an endpoint dedicated to credential validation is configured the same way any other HR endpoint is), rather than "compare a locally stored hash." At that point, `usm_users.c_password` for an employee row genuinely has no remaining purpose at all — not even a placeholder one — which is a stronger, cleaner end state than merely making the column nullable.

Until one of those changes happens, the placeholder mechanism should not be touched, and this report does not recommend touching it now.

## 10. Storage Architecture Options

**Option A — continue storing employees in `usm_users`.**
- Security: weakest of the three, because it keeps employee rows in the same table, and under the same `c_password` NOT NULL constraint, as real admin login credentials — every future employee-table change has to keep reasoning about a column that has nothing to do with HR data.
- Authentication separation: poor — an HR-sourced employee record and a portal login account remain structurally the same kind of row, which is exactly the coupling the immediately preceding phase worked to reduce at the DTO/API level (but could not remove at the schema level, per that phase's explicit instructions).
- Synchronization: workable but awkward — every synced field needs a real `usm_users` column, which means every new HR field (department, designation, joining date, status) is a schema change to a table that also holds admin logins.
- Tenancy: already solid (`company_id` is part of the composite PK).
- Attendance/Leave: no impact either way, since neither references `usm_users` today.
- Migration cost: **lowest** — this is the current state, so "Option A" costs nothing to keep.
- Complexity/maintainability: increasingly poor as more HR-only fields accumulate on a table whose name and history are about authentication, not HR data.

**Option B — a dedicated employee table**, separate from `usm_users`, holding all HR-relevant fields (name, email, department, designation, joining date, status, external identity), with the portal-login concern either removed entirely or reduced to a thin pointer.
- Security: better — HR data and login credentials are no longer forced to share a schema, so a future "employees don't need `c_password` at all" change becomes a normal column removal on a table that never had login semantics, not a re-litigation of `usm_users`'s constraints.
- Authentication separation: much cleaner — a dedicated employee table can exist with zero credential columns from day one, since Section 9's target architecture means an employee row never needs one.
- Synchronization: natural fit — new HR fields are additions to a table that already exists specifically for HR data, not intrusions into an authentication table.
- Tenancy: needs its own `company_id` scoping, same pattern as everything else in this codebase; not automatically inherited from `usm_users`.
- Attendance/Leave: still no required change, since both remain denormalized — though this option does open the door to *eventually* giving them a real foreign key if that's ever wanted, without being required to.
- Migration cost: **moderate** — existing `usm_users` employee rows would need a one-time migration into the new table, and every current employee-facing code path (repository, service, controller, frontend API client) would need to point at the new table. This is real work, but bounded and well-understood work.
- Complexity/maintainability: best of the three for anything HR-specific, at the cost of introducing a second table to keep in sync conceptually with `usm_users` for the (shrinking) portal-login use case.

**Option C — a dedicated HR employee table plus a separate mapping table to portal identity, only where a portal identity is actually needed.**
- Security: best — HR data lives in its own table with no credential columns at all, ever; the mapping table is the only place "this HR employee corresponds to this portal login, if one exists" is recorded, and most employee rows may have no such mapping at all once real employee portal accounts stop being manufactured by AttendHub.
- Authentication separation: cleanest possible — an HR employee record and a portal account become genuinely two different kinds of things, related by an explicit, optional link, matching the target architecture's own separation of concerns.
- Synchronization: best fit of the three — the sync process only ever writes to the HR employee table and the external-identity columns described in section 5; it never has to reason about authentication at all.
- Tenancy: same requirement as Option B — needs its own scoping, but a mapping table naturally carries `company_id` too, making cross-tenant mapping collisions structurally harder to introduce by accident.
- Attendance/Leave: no forced change; the mapping table is exactly the kind of "connect two independently-evolving concepts" structure that would let a future phase introduce a real FK from Attendance/Leave into HR employee data without ever touching `usm_users`.
- Migration cost: **highest** of the three — two new tables/concepts instead of one, and a decision about what (if anything) happens to the handful of existing employee rows' relationship to login capability.
- Complexity/maintainability: most moving parts, but also the most correct long-term shape given where section 9's target architecture is heading (employees mostly won't need portal login rows at all once mobile auth defers to HR).

This report's honest assessment: Option C is architecturally the best match for the stated target ("HR is the source of truth; AttendHub is not the credential authority"), but Option B is a reasonable, lower-risk intermediate step that gets almost all of the security and synchronization benefit without introducing a second new table before the mapping concept has been proven necessary in practice. Option A should not be the end state — continuing to add HR-only columns to `usm_users` compounds the exact coupling this codebase's own recent phase was working to reduce.

## 11. Attendance / Leave Compatibility

Both modules already avoid the one failure mode that would be catastrophic here: they do not foreign-key `employeeId` to `usm_users` at all, and every record carries its own denormalized `employeeName`/`employeeCode`. This means whatever storage architecture is chosen in section 10, Attendance and Leave's *existing* historical records are safe by construction — they don't need to be migrated, re-pointed, or even made aware that employee storage changed underneath them, as long as `employeeId` values remain stable strings.

The risk to watch for is specifically in section 7's deactivation rule: if a future implementation phase ever changes an employee's `employeeId` value as part of a storage migration (for example, moving from `usm_users.user_id` to a new dedicated table's own primary key), every existing Attendance/Leave record referencing the old id would need a corresponding, careful backfill — this is precisely why section 7 recommends against ever hard-deleting or renumbering an employee record in response to a sync event, and why any future storage migration (section 10, Option B or C) needs to either preserve the existing `usm_users.user_id` value as the employee's ongoing identity for Attendance/Leave's purposes, or execute a one-time, carefully verified backfill of every historical record — not something to leave implicit.

## 12. Multi-Tenant Safety

```
Company A HR
    |
    v
Company A employees only

Company B HR
    |
    v
Company B employees only
```

The existing integration foundation already gets the hard part of this right: `integration_master`/`integration_detail`/`integration_field_mapping` are all scoped by `company_id` as part of their composite primary keys, and every controller resolves `companyId` from the authenticated session (or, for Super Admin, an explicit query parameter checked against the caller's own company for anyone who isn't Super Admin) — never from a client-supplied value trusted at face value. An HR sync built on top of this foundation should extend the exact same pattern: every sync operation is scoped to one `(company_id, integration_id)` pair, and the external-identity uniqueness constraint recommended in section 5 — `(company_id, integration_id, external_employee_id)` — is specifically designed so that Company A's HR system and Company B's HR system can each freely use employee ID `"4471"` without any risk of collision, because the tuple that has to be unique includes `company_id`. A global uniqueness constraint on `external_employee_id` alone (without `company_id` in it) would be a real, avoidable bug — this report flags it explicitly so a future implementation doesn't get this backwards.

## 13. Sync Execution Model

**Manual sync** (an admin clicks "Sync now"): the lowest-risk starting point, and the only one that requires no new infrastructure at all — it is a natural extension of the `IntegrationEndpointExecutorService.execute()` call that already exists for the "test endpoint" feature, just applied to whichever endpoint is configured as the "employees" endpoint for that integration, followed by running the result through `FieldMappingService.applyToResponse()` and then the create/update/deactivate logic from section 7. This is buildable without adding any new dependency to `backend/package.json`.

**Scheduled sync** (runs automatically on an interval): requires adding a scheduling dependency — `backend/package.json` currently has none (`@nestjs/schedule` or equivalent is not present) — plus a decision about where that schedule is configured (per-company? per-integration? a fixed global interval?) and what happens if a scheduled run is still in progress when the next one would fire (a concurrency guard is required, not optional, given `IntegrationEndpointExecutorService`'s current single-call, no-retry design).

**Webhook/event sync** (the HR system pushes a change to AttendHub as it happens): requires an entirely new inbound endpoint that does not exist today, a way to authenticate that the webhook really came from the claimed HR system (there is no existing signature-verification code anywhere in the integration layer — the three existing gateways only handle *outbound* auth), and a decision about how a webhook payload maps onto the same field-mapping/create-update-deactivate logic a pull-based sync would use, ideally sharing that logic rather than duplicating it.

No implementation of any of these three is being done as part of this report — this is a comparison to inform a future decision, per the task's explicit instruction.

## 14. Idempotency / Retry / Failure Handling

**Idempotency**: the `(company_id, integration_id, external_employee_id)` uniqueness constraint from section 5 is what makes repeated syncs safe — a sync run that processes the same HR employee twice (because a retry re-fetched a page it already handled, or because two sync runs overlapped) must resolve to "find the existing row by this key and decide update-or-no-op," never "insert a new row," which is exactly what a real unique constraint at the database level enforces even if the application logic has a bug. Without such a constraint, a naive create-if-not-found-by-email check is vulnerable to a race between two concurrent sync attempts both seeing "not found" and both inserting.

**Retries**: `IntegrationEndpointExecutorService.execute()` has no retry logic today — a failed call returns `{success: false, ...}` once and stops. A sync process built on top of it needs its own retry policy (with backoff, and a maximum attempt count) at the sync-orchestration layer, not inside the executor itself, so that a transient network blip doesn't require re-running an entire company's sync from scratch, but a genuinely broken integration doesn't retry forever either.

**Concurrent syncs**: the scheduled-sync concurrency guard mentioned in section 13 applies here too — two sync runs for the same `(company_id, integration_id)` running simultaneously is a race condition waiting to happen (both reading the same "existing employee" state, both deciding to write), and should be prevented at the orchestration layer (a simple "is a sync already running for this integration" flag, checked and set atomically, is sufficient — this does not need a distributed lock given the current single-instance-friendly nature of the rest of this codebase).

**Duplicate records**: prevented structurally by the uniqueness constraint above, not by application-level "check first" logic alone (application-level checks are still useful for producing a friendly error, but the database constraint is what actually guarantees correctness under concurrency).

**Concurrent Company Admin edits**: this is section 8's conflict-resolution question, but from a failure-handling angle specifically: a sync process should never let an in-flight Company Admin PATCH request and an in-flight sync write silently interleave into a corrupted mixed state. Whatever conflict-resolution policy is chosen, the actual database write for a given employee record should be a single, atomic operation (a single `UPDATE` with all changed fields, exactly like `PrismaEmployeesRepository.updateInCompany()` already does today) — never a read-modify-write spread across multiple round trips that a concurrent Company Admin edit could land in the middle of.

## 15. Employee Authentication Dependency Map

Everything below was inspected directly and is confirmed still present and functioning as described — none of it should be removed in this phase, and this report is not proposing removing any of it now.

- **`Role.EMPLOYEE`** — one of three values in the `Role` enum (`common/constants/roles.enum.ts`). Consumed by `RolesGuard` (rejects any request whose session role isn't in a route's `@Roles(...)` list), and directly by `@Roles(Role.EMPLOYEE)` on `MeController` and the `GET /attendance/me` route in `AttendanceController`.
- **`employeeId`** — appears on `AuthenticatedUser`, `Session`, and is a real, nullable column on `usm_user_sessions` (`employee_id`). Populated by `PrismaUsersRepository.toProfile()` for any row whose derived role is `EMPLOYEE` (`row.user_id.toString()`), carried through `AuthGuard` onto `request.user`, and read by `MeController`/`AttendanceController` via `@CurrentUser()` — never trusted from a client-supplied value.
- **`usm_users`** — the employee's HR data lives here (section 3); also the same table every login role's credentials live in.
- **`usm_user_sessions`** — deliberately *not* foreign-keyed to `usm_users` (confirmed via the schema and `PrismaSessionsRepository`'s own comment), specifically so it can also hold sessions for the three legacy hardcoded demo accounts, none of which have a real `usm_users` row.
- **`/me`** (`MeController.getProfile`) — resolves entirely from the session's `companyId`/`employeeId`, calls `EmployeesService.findSelf()`, which goes through the exact same `PrismaEmployeesRepository.findByIdInCompany()` used by the Company-Admin-facing employee endpoints.
- **`/attendance/me`** (`AttendanceController.findForSelf`) — resolves `employeeId` from the session only; explicitly strips any client-supplied `employeeId` query parameter before filtering (`AttendanceService.findForEmployee()`), so a request can never see another employee's records by manipulating the query string.

**What eventually needs to change when authentication moves to HR** (not now — this is the forward-looking half of this section, per the task's explicit request): `PrismaUsersRepository.toProfile()`'s employee branch currently derives identity, role, and the (never-real) credential hash all from one `usm_users` row read; once employee login is validated against HR instead of `c_password`, this method's employee branch would need to stop reading/relying on `c_password` at all for that role, and `AuthService.login()`'s bcrypt-comparison path would need an HR-backed alternative specifically for rows whose role resolves to `EMPLOYEE` (Company Admin/Super Admin login would be completely unaffected, since neither of those roles is in scope for HR-backed auth per the target architecture). `usm_user_sessions.employee_id` and everything downstream of it (`AuthenticatedUser.employeeId`, `/me`, `/attendance/me`) would not need to change shape at all — they would keep working exactly as they do today, because they already treat `employeeId` as an opaque identifier resolved once at login time, not as anything tied to how that login was validated.

## 16. Recommended Target Architecture

The end state this report recommends working toward, consistent with the diagram in the task and everything found during inspection:

External HR software remains the sole source of truth for employee HR data and employee credentials, exactly as today. AttendHub's Integration Gateway (already built, real, and reusable — section 4) is extended with an Employee Sync capability that reads employee data through the existing endpoint/field-mapping configuration and writes it into whichever employee storage model section 10 lands on (this report's lean is Option B as a pragmatic middle step, with Option C as the fuller long-term shape) — tagged with the external-identity columns from section 5, governed by the ownership/conflict rules from section 8, and behaving per the create/update/deactivate rules from section 7. AttendHub's own data (Company Admin accounts, integration configuration, sync metadata, and — for as long as it's structurally required — the `c_password` compatibility placeholder) stays exactly where it is. Employee authentication, once designed and implemented (Phase D, not this report), is validated against HR through that same Integration Gateway rather than against any locally stored credential, at which point the mobile app (Phase E, not present in this repository today) becomes the natural consumer of that authentication path and of the now-synced employee/attendance/leave data.

## 17. Recommended Implementation Phases

**Phase A.1 — Durable audit logging** (small, and arguably a prerequisite rather than optional, given HR sync's need for a trustworthy audit trail).
- Objective: make `SystemLogsModule` write to the real `system_logs` table instead of an in-process array.
- Backend work: swap `InMemorySystemLogsRepository` for a new `PrismaSystemLogsRepository` behind the same interface `SystemLogsService` already expects.
- Database work: none — `system_logs` already exists in `schema.prisma`.
- Frontend work: none expected — the System Logs page already reads through `SystemLogsService`'s existing shape.
- Integration work: none.
- Tests: every existing test asserting "no password reaches system logs" (from the immediately preceding phase) needs to keep passing against real persisted rows, not just in-memory ones.
- Dependencies: none.
- Risks: low; the main risk is a subtle behavior difference between the in-memory implementation's pagination/filtering and a real SQL query's — worth explicit test coverage.

**Phase A.2 — HR employee identity + storage decision (design → schema, no sync logic yet).**
- Objective: pick and implement Option A/B/C from section 10, and add the external-identity columns from section 5.
- Backend work: new/updated repository for wherever employee HR data ends up living; `Employee` interface gains the new fields from section 6 (department, designation, status, joining date, external identity, sync metadata) once the storage decision is made.
- Database work: the schema change section 10 requires (a new table for Option B/C, or new columns for Option A) — explicitly not attempted in this report.
- Frontend work: the Employees page/form/details drawer would need to grow the new fields once they exist — matching the same care the immediately preceding phase took to only show fields the backend contract actually supports.
- Integration work: none yet — this phase only prepares storage, it does not sync anything.
- Tests: full CRUD test coverage for the new/changed employee shape, tenant isolation re-verified for whatever new table/columns were added.
- Dependencies: the storage decision (a product/architecture choice, not purely technical — see section 18).
- Risks: moderate — this is the highest-leverage decision in the whole roadmap, since every later phase builds on it; getting it wrong is expensive to unwind later.

**Phase B — Frontend Integrations wiring** (currently entirely missing — see section 2).
- Objective: connect `pages/control/Integrations.tsx` (and its endpoint/field-mapping sub-pages) to the real backend that already exists, following the same "inspect the real DTO/response shape first" discipline the Employees migration used.
- Backend work: none — the API already exists.
- Database work: none.
- Frontend work: a new `api/integrations.ts` (and likely `api/endpoints.ts`/`api/field-mappings.ts`) modeled on `api/companies.ts`/`api/employees.ts`; retire `services/mockIntegrationService` for this page once real data is wired.
- Integration work: none beyond wiring.
- Tests: frontend build/typecheck, plus manual verification against a real integration record.
- Dependencies: none — this can happen independently of Phase A.
- Risks: low — this is largely mechanical, following an established pattern in this same codebase.

**Phase C.1 — Manual employee sync** (the smallest real implementation of section 4's missing piece).
- Objective: an admin-triggered "sync employees now" action for one `(companyId, integrationId)`.
- Backend work: a new sync service that calls `IntegrationEndpointExecutorService.execute()` against the endpoint configured for employee data, runs the result through `FieldMappingService.applyToResponse()`, and applies the create/update/deactivate rules from section 7 against the storage decided in Phase A.2.
- Database work: none beyond what Phase A.2 already added, plus whatever sync-run/audit record this phase decides to keep (could reuse `system_logs` once Phase A.1 makes it real).
- Frontend work: a "Sync now" button and a way to see the result (counts created/updated/skipped/failed, and any missing-employee discrepancies per section 7).
- Integration work: this is the integration work.
- Tests: create/update/deactivate/missing-employee scenarios from section 7, idempotency (running the same sync twice produces no duplicates), tenant isolation (Company A's sync never touches Company B's employees).
- Dependencies: Phase A.2 (storage must exist first).
- Risks: moderate — this is where the conflict-resolution policy (section 8) has to actually be decided and implemented, not just discussed.

**Phase C.2 — Scheduled sync** (only after C.1 is proven correct and safe).
- Objective: automatic, recurring sync without a human clicking a button.
- Backend work: add a scheduling dependency, a concurrency guard per integration, and a way to configure the interval.
- Database work: likely a small addition (last-run-at, next-run-at, or similar) if not already covered by Phase A.2's sync metadata.
- Frontend work: a way to configure/view the schedule.
- Integration work: reuses C.1's sync logic entirely — should not duplicate it.
- Tests: concurrency (two scheduled ticks overlapping must not double-sync), failure recovery (a failed scheduled run doesn't silently stop future runs from firing).
- Dependencies: Phase C.1.
- Risks: moderate-to-high — this is the phase most likely to cause a production incident if the concurrency guard or retry/backoff policy is under-tested, since it runs unattended.

**Phase D — Employee HR-backed authentication** (explicitly the next major phase after sync is trustworthy, per the task's own instruction not to design this yet beyond the credential-boundary already covered in section 9).
- Objective, dependencies, and risks are intentionally not detailed further here — the task explicitly scoped this report to design the sync contract, not the authentication flow, and doing so prematurely (before sync has proven the identity/storage model in real operation) would risk designing authentication around assumptions sync might still invalidate.

**Phase E — Mobile application**: cannot be scoped from this repository at all — there is no mobile project present, and this report does not invent implementation details for something not in evidence.

**Phase F — Attendance/Leave production persistence**: best undertaken after Phase A.2 settles what an "employee" durably looks like, so Attendance/Leave's eventual real foreign key (if one is ever added) points at something stable, rather than being designed twice.

## 18. Open Questions / Decisions Required

- **Storage architecture (section 10)**: Option A, B, or C. This is the single highest-impact decision in the entire roadmap and should be made deliberately, not by default inertia toward "just add columns to `usm_users`."
- **Conflict-resolution policy (section 8)**: HR-always-wins, timestamp-based, or a hybrid recency window — and whether Company Admins need to be able to see/override it per field.
- **What "employment status" actually means for AttendHub's purposes**: is a deactivated employee's history still visible to a Company Admin? Does deactivation affect Attendance/Leave reporting immediately, at period-end, or not at all until a human confirms it?
- **Email as a login-lookup key vs. an HR-synced field**: `PrismaUsersRepository.findByEmail()` is used for login lookup today; if email becomes an HR-synced field that can change out from under a user, does an in-progress or cached session need to be re-validated, and does a changed email invalidate anything (e.g., a pending password-reset token tied to the old address)? This wasn't asked for directly but surfaced directly from inspecting the code and is worth a deliberate answer before Phase C ships.
- **Sync execution model (section 13)**: manual-only for the first release, or scheduled from day one — and if scheduled, what's an acceptable default interval, and is it configurable per company or fixed platform-wide?
- **What "the employees endpoint" means per integration**: today, `integration_detail` rows are generic, named endpoints with no special "this one is the employee-list endpoint" designation. Sync needs a way to know which configured endpoint (if any) is the employee source for a given integration — a new field, a reserved name (like `OAUTH2_TOKEN_ENDPOINT` already is for OAuth2), or a dedicated "purpose" column are all options not yet decided.
- **Whether the `c_password` placeholder mechanism should be touched at all before Phase D**: this report recommends leaving it exactly as-is until HR-backed authentication is real and verified (section 9) — worth confirming that's agreed, since it would be easy for a future phase to see the placeholder as "temporary" and try to remove it prematurely, before its replacement actually exists.

---

NO FILES WERE MODIFIED.
NO DATABASE CHANGES WERE MADE.
NO MIGRATIONS WERE CREATED OR RUN.
NO APPLICATION BEHAVIOR WAS CHANGED.
