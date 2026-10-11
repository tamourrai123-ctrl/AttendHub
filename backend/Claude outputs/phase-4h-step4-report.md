# Phase 4H — Step 4: Companies Frontend ↔ Real Backend Integration

**Status: Complete and verified.** Build is clean, all 8 manual test scenarios passed, and the Steps 1-3 auth flow (login/session-restore/logout) remains intact.

## 1. Changes Made

- Rewrote `frontend/src/types/company.ts` to match the real backend contract: `Company` now includes `shortname` and `country` (both real, required columns); `CreateCompanyInput` now includes the caller-supplied `id`; a new `UpdateCompanyInput` and `CompanyFormSubmission` discriminated union were added so an update payload can never accidentally include `id`. The old `search`/`status`/`sort` query fields were removed from `CompanyListQuery` since the backend never supported them.
- Created `frontend/src/api/companies.ts` — a real API module (`getCompanies`, `getCompanyById`, `createCompany`, `updateCompany`, `updateCompanyStatus`, `deleteCompany`) built on the Step 1-3 `apiClient`.
- Rewrote `frontend/src/pages/control/Companies.tsx` — pulls from the real API, uses the real `{items, meta:{page,limit,total}}` pagination shape, and removes the search box, status/integration filter dropdowns, and sortable column headers (the backend doesn't support any of those). Added Short Name and Country as visible table columns. Delete/deactivate/activate now call the real endpoints and show an error toast on failure instead of failing silently.
- Rewrote `frontend/src/pages/control/companies/CompanyFormModal.tsx` — added ID (immutable once created), Short Name, and Country fields with client-side validation matching the real DTO constraints; backend field-validation errors (400s) now route to the correct input instead of a generic message.
- Small addition to `frontend/src/pages/control/companies/CompanyDetailsDrawer.tsx` — now also displays Short Name and Country (everything else there was already unchanged/correct, since it receives its data as a prop with no extra request needed).
- Fixed a knock-on build break in `frontend/src/pages/control/Dashboard.tsx` (see section 3 below) — a one-line type-import fix, no behavior change.

## 2. API Connections

| Frontend action | Backend endpoint |
|---|---|
| Load Companies list / change page | `GET /api/companies?page={n}&limit=8` |
| Create Company | `POST /api/companies` |
| Edit Company | `PATCH /api/companies/:id` |
| Activate / Deactivate | `PATCH /api/companies/:id` (body: `{ status }`) |
| Delete Company | `DELETE /api/companies/:id` |
| View Company details drawer | *(no request — uses the row already loaded by the list call)* |

## 3. Mock Code Removed

- `frontend/src/services/mockCompanyService.ts` and `frontend/src/mock/companies.ts` are marked **RETIRED FROM THE COMPANIES MODULE** with a banner comment (I can't delete files on your machine, so they're left in place, clearly marked).
- **Correction I need to flag:** my first pass assumed these two files were completely dead and said so in their banners. The first `npm run build` you ran caught that `pages/control/Dashboard.tsx` (the platform overview page) also imports `getCompanies` from the mock service for its stats card — I'd missed it because it wasn't in the working copy of your repo I'd inspected. Since Dashboard is out of scope for this step (its integrations, API summary, and activity feed are *all* still mock — switching only its company count to real data would leave it half-real), I did **not** migrate it. Instead I made a one-line fix: Dashboard now imports the `Company` type it needs from the mock service itself rather than from `types/company.ts` (which now holds the real shape). Zero behavior change to Dashboard. The banners on both retired files were corrected to say they're still needed until Dashboard gets its own migration step — please don't delete them yet.

## 4. Contract Adaptations

- **Company ID — spec correction.** The Step 4 spec said the ID must be "exactly 2 characters." Direct inspection of `create-company.dto.ts` shows `@Length(1, 2)` — **1 to 2 characters**, not exactly 2. I implemented the real constraint and validate 1-2 characters client-side, with the backend as final authority.
- **Shortname** is a new required field (max 10 characters, must be unique) with no equivalent in the old mock model — added to the form and to client-side validation.
- **Country** is a new required integer field. No country list/LOV exists anywhere in your system yet (the `app_lov_master`/`app_lov_detail` tables are real but currently empty, and there's no HTTP endpoint exposing them at all) — so this is a plain numeric input with an explanatory hint, not a dropdown. I did not invent a country list.
- **Pagination**: the real `GET /companies` only accepts `page`/`limit`. There is no server-side `search`, `status`, or `sort` support, so I removed those controls entirely rather than faking them against a single loaded page (which would silently mislead you once you have more companies than fit on one page).
- **Immutable ID**: the edit form shows the ID read-only/disabled, and the PATCH payload never includes `id` — `UpdateCompanyDto` doesn't declare that field, and the backend's strict validation would reject the whole request if it were present.

## 5. Backend Changes

No backend changes were required.

## 6. Tests

- ✅ Frontend build (`npm run build`) — clean, no type errors, after one round-trip fix (the Dashboard.tsx issue in section 3).
- ✅ Companies list loads from the real backend, confirmed via Network tab.
- ✅ Pagination — real `page`/`limit` requests.
- ✅ Create — valid company created and persisted.
- ✅ Validation — inline field errors from the backend displayed correctly.
- ✅ Duplicate handling — conflict (409) shown clearly.
- ✅ Edit — changes persisted across a refresh; ID field confirmed immutable.
- ✅ Delete / Status — deactivate, reactivate, and delete all persisted across a refresh.
- ✅ Authentication regression — login, session restore, and logout (Steps 1-3) all still work; logging out and navigating directly to the Companies URL correctly redirects to login instead of showing stale data.

You confirmed all of the above passed manually.

## 7. Remaining Limitations (honest, by design)

- **No server-side search, status filter, or sort** on Companies — the backend doesn't support them yet. If you need these, they'd have to be added to the backend first (out of scope for this step).
- **No country list** — country is a raw numeric input. If/when you want a real country dropdown, someone needs to seed an LOV group (or add a dedicated countries table) and expose it over HTTP; nothing like that exists today.
- **Email/Contact Person will read back empty right after creating a company.** The create form requires these fields (the backend DTO validates them), but they aren't actually stored on the company row — they're derived by looking up that company's admin user, which won't exist until someone creates one through a separate flow. This is a pre-existing backend design, not something introduced or fixed here.
- **Dashboard's company stats are still mock data** (see section 3) — only the dedicated Companies page is wired to the real backend in this step.

## 8. Next Step

I'd recommend **Phase 4H Step 5 — Employees** next, following the same pattern (inspect the real backend contract first, then adapt the frontend). I have **not** started or implemented that — stopping here as instructed.
