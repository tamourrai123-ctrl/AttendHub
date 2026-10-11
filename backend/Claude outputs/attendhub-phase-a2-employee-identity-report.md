# AttendHub — Phase A.2: Minimal Employee Identity

**Implementation report**

This phase added a minimal HR employee identity — `(company_id, integration_id, external_employee_id)` — to the one place employee data currently exists in this application (`usm_users`), without introducing a new profile table, without storing any HR password, and without touching HR sync, employee authentication, or Attendance/Leave.

## Scope decision confirmed before implementing

Before writing any code, investigation showed that `usm_users` (via the existing Employee CRUD) is the **only** place any employee data is persisted today — Attendance and Leave are still entirely in-memory/mock, with no real database tables at all, so there was nothing to change there. That meant the literal instruction "AttendHub should NOT store employee profile data" was in direct tension with the existing, currently-relied-on Employee CRUD feature (Company Admins creating/viewing employees by name/email/phone) and with "do not move to employee sync/authentication yet" (removing the profile fields now, with no sync in place to replace them, would leave Employee management and `GET /me` with nothing to display).

I confirmed the resolution with you before touching any code: **keep `name`/`email`/`phone`/`mobile` exactly as they are**, and add the new identity columns **alongside** them as pure, optional scaffolding — not yet used by anything (no sync exists yet), but immediately usable end-to-end through the existing Employee API for a future phase to build on. This is documented inline everywhere it's relevant (the new script, the schema, the interface, the repository) so nobody mistakes the untouched profile fields for an oversight.

## 1. Files Changed

**New files**

- `backend/scripts/add-employee-identity-columns.ts` — the one-off DDL script (this project's established convention — see section 2).

**Modified files**

- `backend/prisma/schema.prisma` — `usm_users` gains `integration_id BigInt?`, `external_employee_id String? @db.VarChar(100)`, a relation to `integration_master`, and an index reflecting the new partial-uniqueness guarantee; `integration_master` gains the corresponding back-relation (`usm_users usm_users[]`), required for Prisma's schema to be internally consistent.
- `backend/src/employees/interfaces/employee.interface.ts` — `Employee` gains `integrationId: string | null` and `externalEmployeeId: string | null`.
- `backend/src/employees/dto/create-employee.dto.ts` — two new optional fields, `integrationId` (`@IsNumberString`) and `externalEmployeeId` (`@IsString @Length(1,100)`), each independently optional at the DTO level.
- `backend/src/employees/repositories/prisma-employees.repository.ts` — reads/writes the two new columns; a new `findByExternalIdentityInCompany()` lookup (mirrors the existing `findByEmailInCompany()`); `handleWriteError()` extended to give a friendly message for the new unique-index violation and for an `integrationId` that doesn't refer to a real integration for that company.
- `backend/src/employees/employees.service.ts` — a new `assertIdentityIsWholeOrEmpty()` check (both-or-neither enforcement) called from `create()`/`update()`; a create-time duplicate-identity check; `system_logs` metadata now includes the identity fields when set.
- `backend/test/employees.e2e-spec.ts` — a new `HR identity (Phase A.2)` suite (11 tests, see section 7); `cleanupTestData()` extended to also clear `integration_master` test rows.
- `backend/src/employees/repositories/in-memory-employees.repository.ts` — a compile-only fixup, found by your first `npm run build` run. This file is dead code (superseded by `PrismaEmployeesRepository`, no longer provided by `employees.module.ts`, kept on disk for reference only — its own doc comment says so), but it still implements the `Employee` interface, so adding `integrationId`/`externalEmployeeId` as required interface fields broke its seed data and `create()` method at compile time. Added `integrationId: null, externalEmployeeId: null` to the 10 seed records and `dto.integrationId ?? null` / `dto.externalEmployeeId ?? null` to `create()` — purely to satisfy the type checker. No behavior anywhere in the running application is affected by this file either before or after.

**Not changed** (`update-employee.dto.ts` inherits the new fields automatically via `PartialType`, so it needed no edit)

**Untouched, as instructed**

- `usm_users.user_name`/`email_address`/`phone`/`mobile` and everything built on them (Employee CRUD's existing behavior, `GET /me`) — see the scope decision above.
- Attendance, Leave, employee authentication, HR sync, the Integrations frontend, Monitoring, Pricing — none of these were touched.
- No migration directory was created; no existing column, row, or constraint was altered or removed.

## 2. Database Changes

**A real, additive schema change was made** (unlike Phase A.1, which was schema-frozen) — following this project's established "PostgreSQL is manually managed, Prisma only introspects" convention (the same pattern as `scripts/add-real-authentication-columns.ts` and `scripts/create-integration-field-mapping-table.ts`):

- `usm_users.integration_id BIGINT` (nullable) — which HR integration, if any, this employee is linked to.
- `usm_users.external_employee_id VARCHAR(100)` (nullable) — the HR system's own opaque id for that employee.
- `fk_usm_users_integration` — a composite foreign key `(company_id, integration_id) → integration_master(company_id, id)`, the exact same composite-FK pattern `integration_detail` already uses. Postgres's default `MATCH SIMPLE` means a row with `integration_id IS NULL` never triggers this check, so employees with no HR link are unaffected.
- `un_usm_users_company_integration_external_employee_id` — a **partial** unique index on `(company_id, integration_id, external_employee_id)`, only `WHERE integration_id IS NOT NULL AND external_employee_id IS NOT NULL`. This is the actual multi-tenant-safety guarantee: the same `external_employee_id` can exist unlinked, under a different integration, or under a different company, but never twice under the same `(company, integration)` pair. A plain `UNIQUE` constraint can't carry a `WHERE` clause, so this had to be a unique index; Prisma's schema language can't fully represent a partial index either (documented with a `///` comment on the model, matching the same convention already used for `integration_detail`/`integration_master`'s check constraints), but the real enforcement lives in Postgres regardless of how faithfully `schema.prisma` can spell it out.
- `idx_usm_users_external_employee_id` — a plain lookup index.

Every statement in the script is guarded to be safely re-runnable (`ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, a `pg_constraint` check before the FK). Nothing existing was dropped, altered, or renamed. No `employees` profile table was introduced — `usm_users` already exists, already is the sole place an employee row lives, and adding two nullable columns to it satisfied everything the task asked for without inventing a second, parallel storage location.

**Run once, after pulling these changes:**
```
cd backend
npx ts-node scripts/add-employee-identity-columns.ts
npx prisma validate
npx prisma generate
npm run build
npm run test:e2e -- employees.e2e-spec.ts
```
`schema.prisma` has already been hand-updated to match exactly what the script creates (I couldn't run `prisma db pull` myself — no live database connection from this cloud sandbox), so `validate`/`generate` should succeed without needing `db pull` first; running `db pull` afterward is still a good idea just to confirm the live database matches.

**Confirmed on your machine:** the script ran cleanly and its own verification query confirms exactly the schema described above — `integration_id` (bigint, nullable), `external_employee_id` (varchar(100), nullable), the `fk_usm_users_integration` constraint, the plain `idx_usm_users_external_employee_id` lookup index, and the partial unique index `un_usm_users_company_integration_external_employee_id` with its `WHERE (integration_id IS NOT NULL) AND (external_employee_id IS NOT NULL)` clause exactly as designed. The script's own closing line — "No existing column, row, or constraint was changed or removed" — held.

## 3. Repository Implementation

`PrismaEmployeesRepository.toEmployee()` now includes `integrationId: row.integration_id?.toString() ?? null` (same BigInt→decimal-string convention used everywhere else in this repository, e.g. `id`) and `externalEmployeeId: row.external_employee_id ?? null`. `create()`/`updateInCompany()` write both columns only when supplied — `undefined` in the DTO means "don't touch," matching the existing `phone`/`mobile` pattern exactly. A new `findByExternalIdentityInCompany(companyId, integrationId, externalEmployeeId)` mirrors the existing `findByEmailInCompany()` duplicate-check pattern. `handleWriteError()` recognizes the new partial-index violation (P2002) and the new FK violation (P2003, distinguished from the pre-existing `companyId` FK by inspecting `error.meta.field_name`) and turns each into a clear `ConflictException` instead of a raw Prisma error.

## 4. Where employee identity was, and wasn't, needed

Per the instruction to "determine where this employee identity is required" before changing anything:

- **Employees (`usm_users`)** — the only real target. Changed as described above.
- **Attendance / Leave** — inspected; both are still 100% in-memory (`InMemoryAttendanceRepository`/`InMemoryLeaveRepository`), with **no real database table for either at all**. Their record shapes (`AttendanceRecord`/`LeaveRecord`) already carry a denormalized `employeeId`/`employeeCode`/`employeeName` with no foreign key to anything, by original design. There is nothing to add a schema-level identity key to here without first giving Attendance/Leave real tables — which is explicitly a later phase ("Do not move to... Attendance/Leave redesign"). Not touched.
- **Authentication** — inspected (`AuthenticatedUser`, `Session`, `usm_user_sessions`, `PrismaUsersRepository`). Employee sessions still resolve `employeeId` from `usm_users.user_id` exactly as before; nothing here reads or depends on the new `integration_id`/`external_employee_id` columns. Not touched, per "do not move to... authentication yet."
- **Integrations** — inspected only to confirm the exact shape of `integration_master`'s primary key (composite `(company_id, id)`) so the new foreign key could be modeled correctly. No Integrations code was changed.

## 5. Data Ownership / What This Does and Doesn't Do

This phase does **not** implement HR sync: nothing populates `integration_id`/`external_employee_id` automatically. A Company Admin can optionally supply both at employee create time, or attach them to an existing employee later via update — useful for testing this identity end-to-end, or for a manual bridging step ahead of real sync — but no code path reads an external HR API yet. An employee created with no identity (the default, and everything the pre-existing test suite already does) behaves exactly as before this phase.

## 6. Security

No employee password of any kind is stored or accepted by this phase — `CreateEmployeeDto`/`UpdateEmployeeDto` still have no `password` field, and the pre-existing `c_password` compatibility-placeholder mechanism (Phase 4's Employee Credential Handling work) is completely untouched. `integrationId`/`externalEmployeeId` are not profile data by any definition — an opaque numeric integration reference and an opaque HR-system id, nothing about who the person is. `EmployeesService.update()`'s `system_logs` metadata now includes these two fields when changed, which is safe: neither is credential material, matching the same "log everything except credentials" rule already applied to `name`/`email`/`phone`/`mobile`.

## 7. Tests

**Confirmed passing on your machine.** `npx prisma validate` succeeded, `npx prisma generate` regenerated the client cleanly, `npm run build` compiled with zero errors (after the one dead-code fixup described in section 1), and:

```
Test Suites: 1 passed, 1 total
Tests:       32 passed, 32 total
Time:        13.211 s
```

All 32 `employees.e2e-spec.ts` tests pass, including every pre-existing test (Create/Read/Pagination/Admin exclusion/Tenant isolation/Self endpoint/Update/Delete) unmodified in behavior, plus the new `HR identity (Phase A.2)` suite (11 tests):

- create with no identity → both fields `null`
- create already linked to an integration → both fields round-trip correctly
- reject a half-set identity on create, both directions (`integrationId` alone; `externalEmployeeId` alone) → 400
- reject an `integrationId` belonging to a **different** company → 409 (the composite-FK cross-tenant guarantee)
- reject a duplicate `(integrationId, externalEmployeeId)` pair within the same company → 409
- allow the same `externalEmployeeId` under two different integrations in the same company
- allow the same `externalEmployeeId` in a different company under its own integration
- link an existing, identity-less employee to an integration later, via update
- reject a half-set identity on update
- confirm the response shape never grows beyond the existing 7 fields plus the 2 new ones (no profile field crept in)

An earlier run surfaced two issues before this passing result, both now resolved and folded into this report: `nest build` initially failed on the unrelated dead-code file described in section 1 (fixed), and the first test run failed on `usm_users.integration_id` not existing because the DDL script (section 2) hadn't been run yet against the live database (resolved by running it) — neither reflects a defect in the Phase A.2 design itself.

## 8. Pre-existing Issues

- `usm_users` still conflates Company Admins/Super Admins/plain Employees in one table (`isPlainEmployeeRow()` is the one place that's worked around) — unrelated to this phase, unchanged.
- The known audit-log actor-display-name gap (Phase A.1's report) is unrelated and untouched.
- Attendance/Leave remain fully in-memory with no real tables — flagged again here since it's the direct reason those two modules had nothing to change in this phase; a future phase giving them real, persistent storage will need its own identity-key decision (likely referencing this same `(company_id, integration_id, external_employee_id)` key, or the `usm_users.user_id` this identity is now attached to).

## 9. Remaining Project Status

**Completed / substantially implemented**

- Company management, Employee CRUD, employee credential decoupling, admin authentication/session infrastructure, HR Integration backend foundation, endpoint configuration, field mapping foundation, durable System Logs (Phase A.1)
- Minimal employee HR-identity key on `usm_users` (Phase A.2, this report)

**Still remaining**

- HR → AttendHub employee synchronization (populating the new identity fields automatically, and everything else Phase A.2 deliberately left alone)
- Real Integrations frontend (and System Logs frontend, both still mock)
- Employee HR-backed authentication
- Mobile application
- Production Attendance persistence, production Leave persistence (including whatever identity key they end up needing once they have real tables)
- Monitoring persistence, Pricing persistence
- Eventual removal of legacy Employee authentication

None of the "still remaining" items were implemented, redesigned, or otherwise advanced in this phase.

---

Minimal employee identity (company_id, integration_id, external_employee_id) is now in place on usm_users.

No employees profile table was introduced.
No HR employee passwords were stored.
No HR employee profile data was duplicated.
No HR synchronization was implemented.
No employee authentication changes were made.
No Attendance/Leave changes were made.
