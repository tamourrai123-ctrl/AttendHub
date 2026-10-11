# AttendHub — Phase A.1: System Logs Database Migration

**Implementation report**

This phase replaced `InMemorySystemLogsRepository` with a real, PostgreSQL/Prisma-backed `PrismaSystemLogsRepository`, reusing the existing `system_logs` table. No other module was touched beyond what this migration itself required inside the System Logs module and two pre-existing e2e test files whose own assertions call directly into `SystemLogsService`.

---

## 1. Files Changed

**New files**

- `backend/src/system-logs/repositories/prisma-system-logs.repository.ts` — the new Prisma-backed repository.
- `backend/test/system-logs.e2e-spec.ts` — new e2e suite for the System Logs module (none existed before).

**Modified files**

- `backend/src/system-logs/system-logs.service.ts` — now injects `PrismaSystemLogsRepository` instead of `InMemorySystemLogsRepository`; `findAll`/`findById` are now `async`.
- `backend/src/system-logs/system-logs.module.ts` — provider swapped from `InMemorySystemLogsRepository` to `PrismaSystemLogsRepository` (module doc comment updated to match).
- `backend/src/system-logs/system-logs.controller.ts` — `findAll`/`findOne` now `async` and `await` the service, matching its new async return type. No route, DTO, guard, or response-shape change.
- `backend/test/employees.e2e-spec.ts` — one pre-existing test ("an ordinary HR-data update never writes any password-related key into system logs") called `systemLogsService.findAll(1, 500).items` synchronously; this now has to be awaited, since `findAll` performs real database I/O. Updated to `await`, and hardened with a small polling helper (see section 5).
- `backend/test/integrations.e2e-spec.ts` — same fix, for the pre-existing test "never writes apiKey/apiSecret into system logs".

**Untouched, as instructed**

- `backend/prisma/schema.prisma` — no changes.
- `backend/src/system-logs/interfaces/system-log-entry.interface.ts` — `SystemLogEntry`/`RecordSystemLogInput` are byte-for-byte unchanged.
- `backend/src/system-logs/repositories/in-memory-system-logs.repository.ts` — left on disk, unused, exactly as `InMemoryCompaniesRepository`/`InMemoryIntegrationsRepository` were left after their own migrations.
- All ~24 existing `systemLogsService.record({...})` call sites across `auth.service.ts`, `companies.service.ts`, `employees.service.ts`, `integrations.service.ts`, `endpoints.service.ts`, `field-mappings.service.ts`, and `pricing.service.ts` — none needed to change (see section 3).
- Attendance, Leave, the Integrations frontend, Monitoring, Pricing persistence, employee authentication, HR sync — none of these were touched.

## 2. Database Changes

```
No schema changes.
No migrations.
Existing system_logs table reused.
```

The Prisma schema was inspected but not modified. `system_logs` already existed with these columns: `id` (BigInt, PK, autoincrement), `company_id` (VARCHAR(2), nullable, FK to `usm_company`), `user_id` (BigInt, nullable), `action` (VARCHAR(100)), `module` (VARCHAR(50), nullable), `description` (unbounded text, nullable), `ip_address` (VARCHAR(45), nullable), `request_method` (VARCHAR(10), nullable), `request_path` (VARCHAR(500), nullable), `status` (VARCHAR(20), nullable), `created_at` (timestamp, `@default(now())`). All of it was already there; nothing was added, removed, renamed, or retyped.

## 3. Repository Implementation

`PrismaSystemLogsRepository` implements the same three-method contract `SystemLogsService` already called on `InMemorySystemLogsRepository` — `add()`, `findAll()`, `findById()` — so no second, incompatible repository abstraction was introduced.

The real complexity here is that `system_logs` was clearly modeled as an **HTTP-request-level access log** (`ip_address`, `request_method`, `request_path`, `status`), not as the **domain-action audit log** `SystemLogEntry` actually is (a typed `resource`, an optional `resourceId`, a `severity`, a free-text actor `user` name, and an arbitrary `metadata` object). Since the schema could not be changed, the repository adapts to the columns that exist rather than the reverse:

| `SystemLogEntry` field | `system_logs` column | Notes |
|---|---|---|
| `id` | `id` | Exposed as `row.id.toString()` — same convention `PrismaEmployeesRepository` uses for `user_id`. **Format change:** ids are now plain decimal strings instead of the in-memory repo's `syslog_<uuid>`. Nothing in the codebase parses that old prefix, and in-memory log data never survived a restart anyway, so this is a one-time, documented format change, not a compatibility break. |
| `timestamp` | `created_at` | DB-generated (`@default(now())`), read back as an ISO string. |
| `action` | `action` | Direct mapping; VARCHAR(100) comfortably fits every action constant in use (longest is 34 chars). |
| `resource` | `module` | Direct mapping; VARCHAR(50) fits every `SystemLogResource` value (longest, `IntegrationEndpoint`, is 19 chars). |
| `severity` | `status` | Repurposed — `status` reads naturally as an entry's severity/outcome for a domain audit log, and every severity value fits VARCHAR(20) easily. This mirrors a pattern already established in this codebase (the Integration auth gateways reusing `api_key`/`api_secret` across auth types). |
| `resourceId` | `request_path` | Repurposed to hold the raw `resourceId` value (not a real HTTP path) — no caller currently gives `SystemLogsService` an actual request path/method/IP, so this column was otherwise unused, and VARCHAR(500) comfortably fits any id in use. |
| `user` (actor display name) | folded into `description` | See below. |
| `description` | `description` | The human-readable text passed by the caller. |
| `metadata` | folded into `description` | See below. |

**Why `user` and `metadata` live inside `description`:** neither has any column to go into. `user_id` is a real `BigInt`, but every one of the ~24 existing call sites passes an already-resolved display-name **string** (`user: actorName`), never a raw numeric id — casting a name into a BigInt column isn't possible, and populating it for real would mean threading a numeric actor id through 7 unrelated service files, which is out of this phase's scope. Rather than silently dropping `user`/`metadata` (both are actively used today — e.g. `employees.service.ts` logs `{ employeeId, companyId, changes }` as metadata on every update), the repository encodes them as a small JSON footer appended to the stored `description` value, behind a marker (`\n\n[[SYSLOG_META]]\n`) that is extremely unlikely to appear in ordinary text. On read, the footer is parsed back out and the human-readable description and the original `user`/`metadata` are reconstructed exactly as `SystemLogsService`/`SystemLogsController` expect — a malformed or legacy footer degrades gracefully to plain text rather than throwing. This is purely an internal storage detail: the JSON envelope never crosses the `SystemLogEntry` boundary, so the returned object shape is identical to before.

**Documented, known compatibility gaps** (not fixed in this phase, per its own scope limits):

- `company_id` is left `null` on every row this repository writes. `RecordSystemLogInput` has no `companyId` field today, and none of the ~24 call sites supply one — adding it would mean touching Auth/Companies/Employees/Integrations/Pricing services, which this task explicitly puts out of scope. This is safe for what this phase actually needs, because `SystemLogsController` is `@Roles(Role.SUPER_ADMIN)`-only — no Company Admin can reach these routes regardless of `company_id` (see section 5). If a future phase opens System Logs to Company Admins, `RecordSystemLogInput` will need an optional `companyId` threaded through those call sites, and `findAll()` will need a `company_id` filter.
- `user_id`, `ip_address`, `request_method` are also left `null` for the same reason — no caller currently supplies that data to `SystemLogsService`.

## 4. Module Wiring

`SystemLogsModule`'s `providers` array now registers `PrismaSystemLogsRepository` instead of `InMemorySystemLogsRepository` — the exact same pattern `CompaniesModule` and `EmployeesModule` already use for their own Prisma migrations (a concrete repository class injected directly into the service, no injection token/interface indirection). `InMemorySystemLogsRepository`'s file is left on disk, unused, matching how `InMemoryCompaniesRepository`/`InMemoryIntegrationsRepository` were left after their own migrations. `SystemLogsService`'s constructor now takes `PrismaSystemLogsRepository`; `SystemLogsController` is otherwise unchanged (same routes, same `@Roles(Role.SUPER_ADMIN)`, same DTO, same response envelope) apart from `async`/`await` to match the service's new return type.

## 5. Behavior Preserved

- **Pagination:** `PaginationQueryDto` only ever exposed `page`/`limit` — there are no entity/action/date filters anywhere in the current application, in-memory or otherwise, so there was nothing beyond pagination to preserve. `findAll()` now paginates at the database level (`skip`/`take` plus a separate `count()`), following the exact guidance already written into `paginate.ts` for any newly-Prisma-backed list method (that file's own comment calls out `SystemLogsService` by name as the one remaining caller of the old in-memory `paginate()` helper "until this migration").
- **Tenant isolation:** unchanged. `SystemLogsController` was, and remains, `@Roles(Role.SUPER_ADMIN)` only — Company Admins are rejected by `RolesGuard` before the controller method ever runs, independent of `company_id`. Verified with a new e2e test asserting the legacy Company Admin demo account gets 403 on both `GET /api/system-logs` and `GET /api/system-logs/:id`.
- **Sorting:** newest-first, matching the in-memory repository's `unshift()`-based ordering (now `orderBy: { created_at: 'desc' }`).
- **Response shape:** `{ success: true, data: { items, meta } }` for the list endpoint and `{ success: true, data: <entry> }` for the single-entry endpoint, both unchanged. A reconstructed `SystemLogEntry` has exactly the same keys as before (`id, timestamp, user, action, resource, resourceId, severity, description, metadata`), verified by a new e2e test.
- **`SystemLogsService.record()`'s calling convention:** unchanged at all ~24 call sites. It's still called as a bare, non-awaited statement everywhere. Internally, it now does real async database I/O, but it stays fire-and-forget by design — a system-log write failure must never block or fail the primary business operation it's recording (creating a company should still succeed even if the audit write fails). Failures are caught and logged (without ever logging the raw input) rather than thrown.
- **One deliberate, disclosed trade-off:** because `record()` is fire-and-forget and none of its ~24 callers await it, there is a small, real window between an HTTP response returning and its corresponding `system_logs` row committing to Postgres. Two pre-existing tests (in `employees.e2e-spec.ts` and `integrations.e2e-spec.ts`) call an HTTP endpoint and then immediately query `SystemLogsService.findAll()` for the resulting entry — with the in-memory repository this was always synchronous and instant; with a real database it isn't guaranteed to be. Rather than touch `employees.service.ts`/`integrations.service.ts` (out of scope) to force those specific writes to be awaited, both tests — plus the new System Logs suite — now poll briefly (a `waitForSystemLogEntry()` helper, up to 2 seconds in ~50ms steps) instead of asserting immediately. This is a test-only robustness change, confined to the exact two lines whose behavior this migration's async return type forced to change anyway.

## 6. Security

No system-log call site was changed, so nothing new is passed to `record()` by this phase — the credential-safety guarantee remains entirely the responsibility of each caller (e.g. `employees.service.ts` already builds an explicit `safeChanges` object rather than spreading the raw DTO; `integrations.service.ts` already logs `apiKeyRotated: true` instead of the real key). The repository itself never expands what gets persisted: it stores exactly `action`, `resource`, `description`, `severity`, `resourceId`, `user`, and `metadata` — the same fields the in-memory version stored, nothing added. Error-handling code inside `SystemLogsService.record()`'s `.catch()` only logs the failing `action`/`resource` and the error message, never the raw `input` object, so a caller's `metadata` can never be echoed into application logs through this path. A new e2e test (`Column-mapping / leakage boundary`) confirms caller-supplied metadata lands only in the `description` column's JSON footer and never spills into the repurposed `module`/`status`/`request_path` columns.

## 7. Tests

**Could not be run in this cloud sandbox** (no live PostgreSQL instance here, and no shell access to the user's Windows machine), so validation was run by the user on the real machine/database instead, with these confirmed, real results:

```
D:\Work\Work\API Integration\backend>npx prisma validate
The schema at prisma\schema.prisma is valid 🚀

D:\Work\Work\API Integration\backend>npx prisma generate
✔ Generated Prisma Client (v6.19.3) to .\node_modules\@prisma\client in 168ms

D:\Work\Work\API Integration\backend>npm run build
> nest build
(completed with no errors)

D:\Work\Work\API Integration\backend>npm run test:e2e -- system-logs.e2e-spec.ts employees.e2e-spec.ts integrations.e2e-spec.ts
 PASS  test/system-logs.e2e-spec.ts (21.097 s)
 PASS  test/employees.e2e-spec.ts (6.123 s)
 PASS  test/integrations.e2e-spec.ts

Test Suites: 3 passed, 3 total
Tests:       56 passed, 56 total
```

All 56 tests passed, across all three suites: the new System Logs e2e suite in full (access control/RBAC, create, read + exact response shape, WARNING severity, real-Postgres persistence, database-level pagination, newest-first ordering, and the metadata leakage-boundary check), plus the two pre-existing suites whose system-logs assertions this migration required touching (`employees.e2e-spec.ts`'s "an ordinary HR-data update never writes any password-related key into system logs" and `integrations.e2e-spec.ts`'s "never writes apiKey/apiSecret into system logs" both pass with the new `await` + polling helper). The fire-and-forget write/read-timing trade-off described in section 5 did not cause any flakiness in this run.

Before the user's confirmed run, I did attempt `npm ci`/`npm install` against a full copy of the backend project (with these changes applied) in this cloud sandbox, purely to type-check the new code ahead of time. That failed with a persistent `403 Forbidden` from `registry.npmjs.org` on every package tried (first a transitive dependency, `yoctocolors-cjs`; then a completely unrelated bare `npm install typescript` in an empty scratch project also failed the same way) — a registry-access restriction of this specific sandbox session, unrelated to the project. I did not modify `package.json`/`package-lock.json` to work around it, and it turned out not to matter, since the schema/build/tests all passed cleanly on the user's own machine.

## 8. Pre-existing Issues

- The known audit-log display-name gap (real signed-up users' actor names resolving through `InMemoryUsersRepository`, which has no rows for them, rather than `PrismaUsersRepository`) is unrelated to this migration and was left untouched, per the task's explicit instruction. It's worth noting this gap now has a slightly different visible effect: the `user` string persisted into every log entry is whatever the caller already resolved before calling `record()` — this phase neither fixes nor worsens that.
- No entity/action/date filtering exists anywhere in `PaginationQueryDto` today (only `page`/`limit`), for System Logs or any other list endpoint — noted in case a future phase assumes richer filtering already exists.
- The Integrations frontend page remains entirely mock-driven (`mockIntegrationService`), and the System Logs frontend page is the same (`mockSystemLogService`, `frontend/src/services/mockSystemLogService.ts`) — neither was touched, and neither currently calls this backend at all, which is why this phase had complete latitude over the exact `system_logs` column mapping without risking an existing frontend consumer.
- `system_logs.company_id`/`user_id` remaining unpopulated (documented in section 3) is a genuine, real gap for any future phase that wants Company-Admin-scoped or per-user-filtered system logs — flagged there for that reason.

## 9. Remaining Project Status

**Completed / substantially implemented**

- Company management
- Employee CRUD
- Employee credential decoupling
- Admin authentication/session infrastructure
- HR Integration backend foundation
- Endpoint configuration
- Field mapping foundation
- Durable System Logs, after this phase

**Still remaining**

- HR employee identity/storage design and implementation
- HR → AttendHub employee synchronization
- Real Integrations frontend (and a real System Logs frontend, also still mock)
- Employee HR-backed authentication
- Mobile application
- Production Attendance persistence
- Production Leave persistence
- Monitoring persistence
- Pricing persistence
- Eventual removal of legacy Employee authentication
- Remaining production polish (including the `company_id`/`user_id` gaps on System Logs noted above)

None of the "still remaining" items above were implemented, redesigned, or otherwise advanced in this phase.

---

System Logs are now database-backed.

No HR synchronization was implemented.
No employee authentication changes were made.
No employee storage redesign was implemented.
No Attendance/Leave changes were made.
