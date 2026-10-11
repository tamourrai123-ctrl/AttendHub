# Phase 4G — Real Authentication & SaaS Signup: Final Report

**Date:** 2026-09-15
**Scope:** Replace mock authentication with real, DB-backed authentication; add SaaS self-signup; add password reset/change and an email-verification foundation.
**Test result at hand-off:** 8/8 suites, 142/142 tests passing. `npm run build` and `npm test` clean.

This report is written to avoid overstating production-readiness. Where something is a real gap, it's called out plainly rather than glossed over — see section 8 in particular.

---

## 1. What changed, in one paragraph

Login now verifies bcrypt-hashed passwords against the real `usm_users` table and issues a signed JWT, backed by a real, revocable session row in a new `usm_user_sessions` table (no more in-memory sessions, no more non-JWT random tokens). A new `POST /api/auth/signup` endpoint lets anyone create a brand-new company and its first admin account in one atomic transaction, using only columns that already existed in `usm_company`/`usm_users` plus a small, additive set of new columns for email verification and password-reset tokens. Forgot-password, reset-password, change-password, and email-verification endpoints round out the flow. Every other module (Companies, Employees, Integrations, Endpoints, Gateways, Field-Detection, Field-Mapping) is untouched in its own logic — `AuthGuard`, `RolesGuard`, `@Public()`, `@Roles()`, and `@CurrentUser()` all keep their existing contracts.

## 2. Database changes (manual DDL, not a Prisma migration — per this project's established convention)

Delivered as `scripts/add-real-authentication-columns.ts`, an idempotent one-off script run manually against the real "Tamotam" database (confirmed run successfully; verified via the script's own introspection output):

- `usm_users` gained: `email_verified CHAR(1) DEFAULT 'N'` with a `CHECK (email_verified IN ('Y','N'))` constraint; `email_verify_token_hash CHAR(64)`, `email_verify_expires TIMESTAMP(6)`, `reset_token_hash CHAR(64)`, `reset_token_expires TIMESTAMP(6)` — all nullable, all additive, nothing dropped.
- `usm_users.email_address` gained a real `UNIQUE` constraint (`un_usm_users_email_address`) — the script checks for existing duplicates first and would have skipped this step and warned instead of failing blind; your data had none, so it applied cleanly.
- A new table, `usm_user_sessions` (id, user_key, role, company_id, employee_id, token_hash, issued_at, expires_at, revoked_at), deliberately **not** foreign-keyed to `usm_users` — see section 8 for why. `token_hash` is a SHA-256 hash of the JWT, unique-indexed; the raw JWT is never stored.
- `prisma db pull` / `generate` / `validate` were re-run and confirmed clean against the final schema.

Nothing here can be rolled back automatically — it's additive-only by design, matching how this project has handled schema changes in every prior phase.

## 3. Password storage

Passwords are hashed with **bcryptjs** (pure JS, chosen specifically to avoid native-module compilation on your Windows machine) at cost factor 12. Verified end-to-end by test: `bcrypt.compare()` against the stored hash succeeds, the raw plaintext is never present in the row, and the hash always has the `$2a$`/`$2b$`/`$2y$` shape. This also applies retroactively to `PrismaEmployeesRepository.create()`/`updateInCompany()` (Company Admin-created employee accounts) — those were storing plaintext before this phase and now are not.

## 4. Tokens and sessions

JWTs are signed with `@nestjs/jwt` using a secret read from `JWT_SECRET` (environment), with a 24-hour expiry. `AuthGuard` does two checks on every request: if the bearer token has JWT shape, its signature and expiry are verified first; either way, the token is then looked up by SHA-256 hash in `usm_user_sessions` and must be present, unrevoked, and unexpired. This dual check is what lets the pre-existing e2e test suites' fixed non-JWT string tokens (e.g. `'test-super-admin-token'`) keep working unmodified — they simply skip the JWT-format branch and go straight to the DB lookup, which several existing test files stub. Logout revokes the specific session row; password reset and password change both revoke **every** session for that user, not just the current one.

## 5. Self-signup (`POST /api/auth/signup`)

Runs one Prisma transaction that creates the `usm_company` row and its first `usm_users` admin row together — if either insert fails, both roll back (verified by test: a rejected signup leaves zero orphan rows in either table). `usm_company.id` has no database-side generation, so the service generates a random 2-character id from a 32-symbol alphabet (excludes ambiguous `0/O/1/I`) and retries on collision, up to 8 attempts. **This id space is small — see section 8, it's the single most important thing in this report.** Duplicate email, duplicate shortname, and duplicate company name are each detected via their real unique constraints and reported with distinct, clear error messages (a genuine bug here — duplicate company name being misclassified as a retryable id collision — was caught and fixed during this phase's own test run; see section 9).

The new admin is logged in immediately on signup, matching how most SaaS products behave — email verification is tracked but does **not** gate login in this phase (see decision 8.2).

## 6. Password reset / change / email verification

- **Forgot password**: always returns the same generic message whether or not the email exists — never confirms account existence. Only sends anything (via `EmailService`) if a real account matches.
- **Reset password**: single-use token (SHA-256 hashed at rest, 1-hour expiry), cleared the moment it's consumed; revokes all of that user's sessions on success.
- **Change password** (authenticated): requires the current password; revokes all sessions except none are exempted — the caller will need to log in again too.
- **Email verification**: single-use token (24-hour expiry), marks `email_verified='Y'`.
- **`EmailService`** is log-only by design for this phase — there is no real email provider wired up. It deliberately never logs the raw token (only that an email "would be sent"), so the log itself can't leak a working reset/verify link. Wiring a real provider (SendGrid, SES, etc.) is a follow-up, not part of this phase.

## 7. Account-status login gating

Login checks exactly two existing status fields, nothing invented: `usm_users.account_locked` (checked only **after** the password is confirmed correct, so a wrong-password attempt can't be used to probe whether an account is locked) and `usm_company.status` (a locked company blocks its admins/employees from logging in). `email_verified` is tracked but does not currently block login — flagged as a decision below.

## 8. Decisions requiring your approval

These are real design choices made to keep this phase shippable without redesigning other modules. None of them are silently permanent — they're flagged here on purpose.

**8.1 — The legacy demo-account login bridge.** `login()` checks real `usm_users` first; only if no real row matches the email does it fall back to the three hardcoded demo accounts (`admin@tamotam.test` / `company@tamotam.test` / `employee@tamotam.test`). This exists because Attendance, Leave, Pricing, and Monitoring are still entirely mock/in-memory modules built around those three accounts' fake ids (`cmp_001`, `emp_001`, etc.), and the pre-existing `auth-rbac.e2e-spec.ts` suite exercises them. Real ids can never collide with the legacy ones (a real `usm_company.id` is at most 2 characters; the legacy ids are 7). **Your call:** keep this bridge until Attendance/Leave/Pricing/Monitoring get their own real-data migrations, or remove the three demo accounts now (which would break `auth-rbac.e2e-spec.ts` and those four still-mock modules' own manual testing).

**8.2 — Company-id space is small.** Real company ids are exactly 2 characters from a 32-symbol alphabet — **1,024 possible ids, total, forever** (ids are never recycled). That's a hard ceiling on how many companies can ever sign up, and it's not something this phase introduced or can fix — `usm_company.id VARCHAR(2)` is pre-existing schema. If self-signup is meant to scale past low three digits of companies, this needs a schema change (a wider id column) before it matters in practice, which is a bigger, separate decision I did not make unilaterally.

**8.3 — Email verification doesn't gate login.** A new signup can log in and use the product immediately, unverified. This matches common SaaS UX (verify-later) but is a product decision, not just a technical one — if you want unverified accounts blocked from certain actions, that's additional scope.

**8.4 — Cosmetic audit-log gap.** Five controllers (Companies, Employees, Integrations, Endpoints, Field-Mappings) resolve a display name for system-log entries via `InMemoryUsersRepository.findById()`, which only recognizes the three legacy demo accounts. A real signed-up user's actions are still logged correctly (correct action, resource, company scoping) but show their raw id instead of a friendly name in that one field. Non-breaking, purely cosmetic, deliberately left alone this phase rather than changing five more controllers' constructors for a display-only field.

**8.5 — No rate limiting or brute-force protection.** Login, signup, and forgot-password have no throttling, no CAPTCHA, and no automatic lockout after repeated failures — `account_locked` is only ever set manually (there's no endpoint for it in this phase, and none existed before). This is a genuine gap for a public-facing signup/login surface, worth addressing before this is exposed to the open internet.

## 9. Bugs caught and fixed by this phase's own test run

Two real bugs surfaced while testing signup and are already fixed in the delivered code:

- **`usm_company.title` uniqueness wasn't handled.** A duplicate company *name* was silently retried 8 times as if it were an id collision, then failed with a confusing "could not allocate a company id" error instead of "a company with this name already exists." Fixed.
- **A stale, structurally-impossible test assertion** in `auth-rbac.e2e-spec.ts` expected the legacy demo `COMPANY_ADMIN` (fake companyId `cmp_001`, 7 characters) to have employees in the real, Prisma-backed `usm_users` table (`company_id VARCHAR(2)`) — that could never match, a pre-existing gap from an earlier phase's Employees migration, only exposed once this phase's other fixes let login actually succeed instead of crashing first. Per your direction, the test itself was updated to use a real signed-up company (the same fixture pattern `auth-signup-security.e2e-spec.ts` already established) instead of the fake id — no production code, schema, or auth/employees logic changed for this fix.

Also worth naming honestly: the file-delivery step to your machine silently failed to actually write the new content four separate times during this phase (the tool reported success, but a re-check showed stale content). Every one of those was caught by re-staging and byte-diffing after every single commit, and corrected by retrying — nothing was left unverified, but it's a real quirk of this workflow worth knowing about if files ever seem not to reflect what you were told was sent.

## 10. Test coverage added

`test/auth-signup-security.e2e-spec.ts` (new, 18 scenarios): valid signup, duplicate email/shortname/name, invalid email, weak password (short / no digit), missing fields, the returned token actually authenticating a follow-up request; login against real accounts (wrong password, nonexistent email, locked account, correct role + real companyId); tenant isolation between two independently signed-up companies; password reset (generic message regardless of existence, invalid token, valid reset + old password stops working, token reuse rejected, reset revokes sessions); change password (correct/incorrect current password); email verification (valid, invalid, reuse rejected).

`test/employees.e2e-spec.ts`, `integrations.e2e-spec.ts`, `integration-endpoints.e2e-spec.ts`, `integration-field-mappings.e2e-spec.ts`: updated only to override the real `PrismaSessionsRepository` instead of the retired `InMemorySessionsRepository` — no behavioral changes. `employees.e2e-spec.ts` additionally now asserts passwords are bcrypt-hashed (not stored/rotated as plaintext).

`test/auth-rbac.e2e-spec.ts`: one test updated as described in section 9; every other test in that file is unchanged.

## 11. Files changed (complete list)

New: `src/auth/repositories/prisma-users.repository.ts`, `prisma-sessions.repository.ts`, `src/auth/email/email.service.ts`, `src/auth/utils/password.util.ts`, `token.util.ts`, `src/auth/constants/auth.constants.ts`, `src/auth/dto/{signup,forgot-password,reset-password,change-password,verify-email}.dto.ts`, `scripts/add-real-authentication-columns.ts`, `test/auth-signup-security.e2e-spec.ts`.

Modified: `src/auth/auth.service.ts`, `auth.controller.ts`, `auth.module.ts`, `guards/auth.guard.ts`, `interfaces/session.interface.ts` (doc-comment only), `src/employees/repositories/prisma-employees.repository.ts` (bcrypt on create/update), `src/employees/dto/create-employee.dto.ts` (doc-comment only), `.env.example`, `package.json` (added `@nestjs/jwt`, `bcryptjs`, `@types/bcryptjs`), `test/employees.e2e-spec.ts`, `integrations.e2e-spec.ts`, `integration-endpoints.e2e-spec.ts`, `integration-field-mappings.e2e-spec.ts`, `test/auth-rbac.e2e-spec.ts`.

Untouched: everything in Companies, Integrations/Endpoints/Gateways/Field-Detection/Field-Mapping's own business logic; `RolesGuard`; `@Public()`/`@Roles()`/`@CurrentUser()` decorators and interfaces.

## 12. What this phase deliberately did NOT do

No microservices, no Kubernetes, no event-driven architecture or CQRS, no GraphQL, no Redis, no Kafka, no new queues. Sessions are a plain Postgres table looked up on every request — appropriate at this scale, and consistent with your instruction not to over-engineer. Expired/revoked session rows are never cleaned up automatically (no cron/TTL job) — they just get excluded from lookups by the `expires_at`/`revoked_at` filter. That's fine at low volume; worth a cleanup job eventually, not now.

## 13. Manual steps you already completed

You ran `scripts/add-real-authentication-columns.ts` (idempotent — safe to run again anytime), `npx prisma db pull && npx prisma generate && npx prisma validate`, `npm install` (added `@nestjs/jwt`, `bcryptjs`, `@types/bcryptjs`), and confirmed `npm run build`, `npm test`, and `npm run test:e2e` all pass cleanly (142/142).

## 14. Operational notes for you to keep in mind

`JWT_SECRET` in your `.env` is now a **real, actively-used** secret — it signs every session token. `.env.example` was updated with a comment warning never to deploy with its placeholder value. There is no refresh-token or token-rotation mechanism — a session is a flat 24-hour bearer token; logging out or a password reset/change is the only way to invalidate one early. There's no "log out of all devices" endpoint distinct from password change/reset, though the underlying `revokeAllForUser()` capability already exists in `PrismaSessionsRepository` if you want that surfaced later.

## 15. Honest bottom line

This is real authentication — bcrypt, signed JWTs, DB-backed revocable sessions, an atomic signup transaction, and single-use tokens for reset/verify — and it is **not** hardened for unrestricted public exposure yet. The two things I'd want resolved before that: the 1,024-company id ceiling (8.2) if self-signup needs to scale, and rate-limiting/brute-force protection (8.5). Everything else in this report is either an explicit, reversible scope decision (8.1, 8.3, 8.4) or a genuinely deferred hardening step (13/14) rather than a hidden gap.

---

*Generated as part of Phase 4G. All test results above reflect your own pasted terminal output, not a claim I'm making independently.*
