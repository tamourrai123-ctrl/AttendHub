# Auth, RBAC & Login Flow — Inspection Report

Read-only inspection of the real backend authentication system, the `usm_users`/`usm_company` schema, the guards/RBAC layer, and the current frontend login flow. No code was changed for this report.

## 1. Database schema (Prisma)

**`usm_company`** — one row per tenant. Primary key `id` is `VARCHAR(2)`, caller-supplied, no database-side generation (both `POST /companies` and self-signup generate it in application code and retry on collision). `title` (unique) and `shortname` (unique) are both real, required columns — `title` is what the Companies API exposes as `name`. `country` is a required `Int` with no default. `status` is a single `Char(1)` code (`Y`/`N`/`S`). A self-referencing `pid` column exists (parent company), suggesting a sub-tenant/branch hierarchy that nothing in the code currently reads or writes.

**`usm_users`** — one row per login-capable account, composite primary key `(company_id, user_id)`. Notable columns:
- `c_password` — bcrypt hash (see §2).
- `email_address` — globally unique across all companies (`un_usm_users_email_address`), which is what makes email-based login unambiguous without also knowing a company.
- `is_admin` / `super_admin` — both `VARCHAR(3)` flags (`'Y'`/`'N'`), not booleans. Role is *derived*, not stored directly: `super_admin='Y'` → `SUPER_ADMIN`; else `is_admin='Y'` → `COMPANY_ADMIN`; else → `EMPLOYEE`.
- `account_locked` — a flag column that is only ever **written as `'N'`** at account creation (signup, employee creation). Nothing in the codebase ever sets it to `'Y'`. In other words, there's no automatic lockout (e.g. after repeated failed logins) — an account can only become locked via a direct database update. `login()` does check it and rejects with 403 if it's ever `'Y'`, so the mechanism is honored if someone else sets the flag; the app itself never triggers it.
- `email_verify_token_hash` / `reset_token_hash` (+ expiry columns) — single-use, SHA-256-hashed tokens for the verify-email and forgot-password flows.

**`usm_user_sessions`** — the real, DB-backed session table (separate from JWT expiry — see §2). Stores `token_hash` (unique), `role`, `company_id`, `employee_id`, `issued_at`/`expires_at`/`revoked_at`. One inconsistency worth knowing about: `company_id`/`employee_id` here are declared `VARCHAR(20)`, while `usm_company.id` itself is `VARCHAR(2)`. It's harmless (20 comfortably fits 2), just an unexplained width mismatch rather than a deliberate design choice.

Everything else in the schema (`integration_master`, `integration_detail`, `pricing_master`, `api_logs`, `system_logs`, `app_lov_master/detail`) hangs off `usm_company.id` as the tenant key, consistent with what earlier phases already established.

## 2. Backend authentication flow (`AuthModule`)

- **Login** (`POST /auth/login`, public): looks up `usm_users` by case-insensitive email first. If found, verifies the bcrypt hash, then checks `account_locked` and the parent company's `status`, in that order — deliberately *after* password verification, so a wrong password never leaks whether an account exists or is locked. If no real user matches, it falls back to **three hardcoded demo accounts** (`admin@tamotam.test` / `company@tamotam.test` / `employee@tamotam.test`, plaintext passwords in `InMemoryUsersRepository`) — this is explicitly flagged in the code's own comments as a temporary bridge kept only because several other modules (Attendance/Leave/Pricing/Monitoring) and one e2e suite are still built around those three fake accounts. Real accounts always take priority; the fallback only fires when the email doesn't match any real row.
- **Signup** (`POST /auth/signup`, public): creates a new `usm_company` + its first admin `usm_users` row (`is_admin='Y'`) in one Prisma transaction, generates a random 2-character company id (retrying on collision), hashes the password (bcrypt, cost 12), and logs the new admin straight in. Password policy: min 8 characters, at least one letter and one digit. **This endpoint has no frontend page** — `AppRoutes.tsx` has no `/signup` route and `Login.tsx` has no sign-up link, so it's currently reachable only via direct API calls (e.g. Swagger at `/api/docs`).
- **Session issuance**: a signed JWT (`@nestjs/jwt`, secret from `JWT_SECRET`, 24h expiry) *and* a row in `usm_user_sessions` (hash of the token only — the raw JWT is never persisted). This dual design is what makes logout and password-reset/change able to truly invalidate a session; a bare JWT can't be revoked once issued, but this system checks the DB row on every request too (see AuthGuard below).
- **Logout** (`POST /auth/logout`): revokes the session row for the current token.
- **`GET /auth/me`**: returns the current session's identity — this is what the frontend uses to confirm a cached session is still valid on app load (see §5).
- **Forgot/reset password**: `forgot-password` always returns the same generic message regardless of whether the email matched anything (no account-enumeration signal); `reset-password` consumes a single-use, hashed, time-limited token and **revokes every active session for that user** — a sensible security default. Same session-revocation behavior on `change-password`.
- **Verify email**: consumes a single-use token, sets `email_verified='Y'`. Nothing currently gates access on this — it's tracked, not enforced.
- **Password hashing**: bcryptjs (pure-JS, chosen to avoid native compilation on Windows dev machines), cost factor 12.
- **JWT secret**: `configuration.ts` defaults `JWT_SECRET` to the literal string `'change-me'` if the env var isn't set. `.env.example` warns about this but it's worth double-checking your real `.env` has a strong value set, since a default secret would let anyone forge valid session tokens.

## 3. Guards & RBAC

Two guards run globally on **every** request (registered via `APP_GUARD` in `AuthModule`), in this order:

1. **`AuthGuard`** — establishes identity. Skips entirely for `@Public()` routes. Otherwise requires a `Bearer` token; if the token has JWT shape (three dot-separated segments) its signature/expiry are verified via `JwtService` first, then — regardless of shape — it's looked up in `usm_user_sessions` (`findByToken`, which only returns non-revoked, non-expired rows). This dual check exists so a few older e2e suites that use fixed non-JWT test tokens (by inserting directly into the sessions table) keep working. On success it sets `request.user = { userId, role, companyId, employeeId }` — this is the **only** place identity is established; every controller reads it via `@CurrentUser()`, never from anything the client sent in the body/query.
2. **`RolesGuard`** — authorization. Skips for `@Public()` routes. A route with no `@Roles(...)` decorator is open to *any* authenticated user (e.g. `GET /auth/me`). Otherwise the caller's role must be in the route's allowed list or it's rejected with 403.

`Role` is a plain 3-value enum: `SUPER_ADMIN`, `COMPANY_ADMIN`, `EMPLOYEE` — matched field-for-field by the frontend's `UserRole` type.

### RBAC by module (what I found across controllers)

| Route(s) | Required role | Tenant scoping |
|---|---|---|
| `/auth/login`, `/auth/signup`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/verify-email` | none (`@Public()`) | n/a |
| `/auth/logout`, `/auth/me`, `/auth/change-password` | any authenticated user | n/a |
| `/companies/*` | `SUPER_ADMIN` | none — this is the global cross-tenant list, by design |
| `/employees/*` | `COMPANY_ADMIN` | `companyId` always taken from the session (`@CurrentUser()`), never from the URL/body |
| `/me` (employee's own profile) | `EMPLOYEE` | both `companyId` and `employeeId` come from the session only |
| `/attendance` | `COMPANY_ADMIN` | scoped to session `companyId` |
| `/attendance/me` | `EMPLOYEE` | scoped to session `employeeId` |
| `/leave` | `COMPANY_ADMIN` | scoped to session `companyId`, read-only (no employee-facing endpoint exists) |

Tenant isolation is consistently enforced server-side by reading `companyId`/`employeeId` off the authenticated session, never off anything the client supplies — this pattern is uniform across every module I looked at.

**A real, pre-existing gap** (documented directly in `auth.module.ts`'s own comments, not something I'm newly flagging): five controllers (Companies, Employees, Integrations, Endpoints, Field Mappings) resolve an actor's display name for audit logs by calling `InMemoryUsersRepository.findById(user.userId)` — but that repository only knows the three hardcoded demo accounts. Anyone created through real signup or the real Companies/Employees flows has an id that repository doesn't recognize, so their `system_logs` entries show a raw id instead of a name. Not a crash, just a cosmetic audit-log gap.

## 4. Frontend login flow

- **`Login.tsx`**: a plain email/password form (`AuthCredentials` = email, password, rememberMe) using the shared `Input`/`PasswordInput`/`Checkbox`/`Button` components. Includes a "demo credentials" panel that fills in the three legacy accounts — convenient for testing, but worth remembering it's advertising credentials that bypass the real `usm_users` check entirely (see §2). On success, it does not manually navigate — `AuthContext`'s state update causes a re-render, and the component's own top-of-render redirect (`isAuthenticated && user` → `<Navigate>`) sends the user to their role's home route (or wherever they originally tried to go, via `location.state.from`).
- **`AuthContext.tsx`**: on mount, reads any cached session from storage, optimistically shows that cached user (avoids a login-page flash), then calls `GET /auth/me` to confirm the session is actually still valid server-side — clearing everything on failure. It also listens for a global `SESSION_EXPIRED_EVENT`, dispatched by `client.ts` on *any* 401 from *any* API call, so a session going stale mid-use is handled uniformly rather than needing per-page 401 handling.
- **`session.ts`**: the single place that reads/writes the persisted session (`localStorage` if "remember me", `sessionStorage` otherwise) under the key `attendhub.session`.
- **`client.ts`**: attaches `Authorization: Bearer <token>` to every request, and on a 401 clears the session and fires the event above.
- **`ProtectedRoute.tsx`** / **`AppRoutes.tsx`**: route-level guard by both authentication and role (`SUPER_ADMIN` → `/control/*`, `COMPANY_ADMIN` → `/company/*`, `EMPLOYEE` → `/user/*`), redirecting to `/login` or `/unauthorized` as appropriate. Its own doc comment is explicit that this is a UX safeguard only, not a security boundary — matches reality, since the backend's `RolesGuard` is what actually enforces this.
- **Missing pages, not missing endpoints**: the backend has working `signup`, `reset-password`, `change-password`, and `verify-email` endpoints, but I only found a frontend page for `forgot-password` (and login). There's no signup page, no "reset password" page that would consume the emailed token, no in-app change-password UI, and no email-verification landing page. These aren't broken — they're simply not built yet on the frontend.

## 5. Other observations worth knowing about

- `PrismaService`'s own doc comment says "nothing in this phase reads or writes through this service yet" — that's stale; by now most repositories (auth, companies, employees, integrations, etc.) go through it. Harmless, just an outdated comment.
- No rate-limiting/throttling is applied to `/auth/login` anywhere I could find — nothing prevents rapid repeated login attempts against a given account today.
- The legacy demo-account fallback (§2) is a real, load-bearing dependency for several still-mock modules — removing it isn't a small cleanup, it would need those modules migrated (or their e2e tests updated) first.

## 6. What I did *not* do

This was inspection only — no schema changes, no migrations, no code edits, and no changes to guards, DTOs, or the frontend login flow. Let me know if you'd like me to act on any of the findings above (e.g. wiring up the signup/reset-password pages, or looking at the demo-account fallback).
