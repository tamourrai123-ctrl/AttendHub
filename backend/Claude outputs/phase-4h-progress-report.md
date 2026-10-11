# Phase 4H — Progress Report (in progress)

**Scope:** Connect the existing React frontend to the real AttendHub backend, replacing mock data module by module.
**Status:** Steps 1–3 of the 14-step development order are complete and delivered. Steps 4–14 have not been started.

This is a progress report, not the final phase report — it covers only the work done so far, honestly, with nothing implied about the remaining steps.

---

## 1. What's been done

**Inspection (no code changes):** Mapped the full frontend structure (`src/api` didn't exist yet; `src/services/mock*.ts` + `src/mock/*.ts` held all mock data; `AuthContext`/`ProtectedRoute`/`AppRoutes` were already well-abstracted, with role strings that already exactly match the backend's `SUPER_ADMIN`/`COMPANY_ADMIN`/`EMPLOYEE`). Confirmed the real backend contracts for auth, companies, and employees directly from the actual controllers/DTOs/interfaces — not assumed.

**Built the frontend API layer (Step 1):**
- `src/api/client.ts` — the one central HTTP client. Resolves the backend base URL from `VITE_API_BASE_URL`, attaches the JWT as a Bearer header on every request, parses the backend's real response envelope (`{success:true, data}` / `{success:true, message}` / `{success:false, message}`), converts every non-2xx response into a typed `ApiError` (with backend-provided field errors for 400s), and on any 401 clears the local session and fires a `window` event so the whole app reacts uniformly.
- `src/api/session.ts` — session persistence, same `localStorage`/`sessionStorage` "remember me" split the app already used, now holding a real JWT instead of a fake token.

**Real authentication (Steps 2–3):**
- `src/api/auth.ts` — `login`, `logout`, `getMe`, `forgotPassword`, calling the actual backend routes (`POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/forgot-password`).
- `AuthContext.tsx` — rewritten to use `api/auth` instead of the mock service. On app load, it shows the cached user immediately, then calls `GET /auth/me` to confirm the session hasn't been revoked/expired server-side (not just "is something in storage"). A 401 from any API call anywhere in the app now clears the session automatically.
- `Login.tsx` and `ProtectedRoute.tsx` needed **no changes** — the existing abstraction plus matching role strings meant real auth slotted straight in.
- `ForgotPassword.tsx` — was a static "not available yet" placeholder; now wired to the real endpoint.
- `services/mockAuth.ts` — left on disk (this session can't delete files on your machine) with a comment marking it retired and unused; safe to delete by hand.
- Added `src/vite-env.d.ts` typing for `VITE_API_BASE_URL`, plus `.env.example` (committed) and `.env` (blocked from remote write — you copy `.env.example` → `.env` yourself).

## 2. API connections made so far

```
Login page          → POST /api/auth/login
Session restore      → GET  /api/auth/me
Logout                → POST /api/auth/logout
Forgot password page → POST /api/auth/forgot-password
```

## 3. Mock data removed so far

`services/mockAuth.ts` is no longer imported by anything (retired in place, not deleted — see above). No other mock service or mock data file has been touched yet — Companies, Employees, Integrations, Attendance, Leave, Pricing, Monitoring, and System Logs are all still on their original mock services.

## 4. Backend changes

None. No backend code was modified for this phase so far.

## 5. Known contract mismatches found (not yet fixed — flagged for the next steps)

- **Companies:** the real `POST /api/companies` requires `id` (a 2-character code you choose — there's no DB-side id generation), `shortname`, and `country` (an integer) — fields the current `CreateCompanyInput`/company form don't collect. Also, the real list endpoint only supports `page`/`limit` — no `search`/`status`/`sort` query params server-side, unlike the current mock service.
- **Employees:** the real `Employee` record has no `employeeCode`, `department`, `designation`, `status`, or `joinedAt` — `usm_users` has no matching columns; that data is expected to come from an HR system integration in a later phase. The current Employees page/form/drawer will need those fields removed, not faked.

Both are genuine backend architecture decisions from earlier phases, not something to "fix" by changing the backend — the frontend will be adapted to match.

## 6. Tests

Frontend build: not yet re-run since these changes (you're about to test — see below).
Backend build/tests: unchanged from Phase 4G's last clean run (142/142 e2e tests passing); nothing in this session has touched backend code.

## 7. What's next

Waiting on you to confirm: copy `.env.example` → `.env`, run `npm run start:dev` in `backend/` and `npm run dev` in `frontend/`, log in with a demo account (or a real signed-up one), confirm session-restore-on-refresh and logout work, then run `npm run build` in `frontend/` and paste any errors. Once that's clean, the next step is Companies (Step 4), then Employees (Step 5), continuing in the order from your spec.
