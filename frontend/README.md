# Tamotam — Attendance Integration Platform (Frontend)

Frontend-only build of Tamotam, an Attendance Integration Platform: branding, responsive
layouts, mock authentication, role-based routing, a full Control Panel for Super Admins,
and placeholder panels for Company Admin / Employee. No backend, database, or real API
integrations exist yet — everything runs on mock data and mock services that mimic a
real, paginated REST API shape so they can be swapped for real API calls later without
rewriting any page.

## Stack

React 18 · TypeScript · Vite · Tailwind CSS · React Router v6 · lucide-react

## Getting started

```bash
npm install
npm run dev
```

Then open the printed local URL (defaults to `http://localhost:5173`).

Other scripts:

```bash
npm run build    # type-check (tsc -b) + production build
npm run preview  # preview the production build locally
npm run lint     # eslint
```

## Demo accounts (mock / development only)

| Role | Email | Password |
| --- | --- | --- |
| Super Admin | `admin@tamotam.test` | `admin123` |
| Company Admin | `company@tamotam.test` | `company123` |
| Employee | `employee@tamotam.test` | `employee123` |

The login screen also has one-click buttons that fill these in for you. These accounts
live in `src/mock/users.ts` and are clearly marked as mock/demo data — replace
`src/services/mockAuth.ts` with a real API client when the backend exists; nothing else
in the app needs to change, since `AuthContext` only depends on that file's function
signatures.

## Project phases

### Phase 1 — Foundation & Authentication

- **Branding** — a single `src/config/brand.ts` controls the product name/tagline everywhere.
- **Auth** — `/login` with validation, show/hide password, remember me, mock login,
  logout, and session persistence across refresh (localStorage by default, sessionStorage
  when "remember me" is unchecked).
- **Roles & routing** — `SUPER_ADMIN`, `COMPANY_ADMIN`, `EMPLOYEE`, each redirected to
  their own panel after login (`/control`, `/company`, `/user`). `ProtectedRoute` guards
  every panel route: unauthenticated users are sent to `/login`, authenticated users
  without the right role are sent to `/unauthorized`.
- **Three panels**, each with its own layout (sidebar + topbar).
- **Reusable UI kit** in `src/components/ui`: Button, Input, PasswordInput, Checkbox,
  Card, Badge, Avatar, Modal, ConfirmDialog, Dropdown, Breadcrumb, PageHeader, StatCard,
  Table, EmptyState, LoadingState, ErrorState.
- **Responsive** — the sidebar collapses into a mobile drawer below the `lg` breakpoint;
  tables scroll horizontally on narrow screens; forms and stat grids stack on mobile.

### Phase 2 — Complete Control Panel (Super Admin)

Built out all six Control Panel modules with realistic mock data, full interactivity,
and no changes to the existing route structure or to the Company/Employee panels.

- **Dashboard** — platform-wide stats, integration health breakdown, recent API activity,
  and recent platform activity, all computed client-side from the mock services (never
  hard-coded numbers).
- **Companies** — full CRUD: search, status/integration filters, sortable columns,
  pagination, add/edit modal, read-only detail drawer, activate/deactivate and delete
  with confirmation dialogs.
- **Integrations** — list of every company's integration with search and status filter;
  a detail drawer with four tabs (Overview, Configuration, Field Mapping, Test
  Connection). Credential **values** are never stored — only a `credentialsConfigured`
  boolean flag is persisted to the mock service; masked placeholders are shown when a
  credential already exists. "Test Connection" simulates a network attempt with a
  randomized, weighted-realistic outcome — no real request is made.
- **API Monitoring** — summary stat cards, a searchable/filterable (company, status
  group, method) request log with pagination, and a detail drawer with a dependency-free
  JSON viewer for headers/params/body (values are mock placeholders, not real credentials).
- **System Logs** — a searchable/filterable (severity, resource) audit trail with a
  detail drawer showing structured metadata via the same JSON viewer.
- **Settings** — Platform, Notifications, Security, and System Preferences sections;
  changes are staged locally and only committed via **Save Changes** (mock persistence
  through `mockSettingsService`). The Security section is explicitly labeled UI-only —
  no backend enforces these toggles in this phase.

Every module follows the same **Page → Service → Mock Data** layering: pages never
import mock data directly, only the corresponding `mockXService`. Query/result shapes
(e.g. `CompanyListQuery` / `CompanyListResult`) mirror what a real paginated REST API
would look like, so swapping in real endpoints later shouldn't require page rewrites.

## Project structure

```
src/
├── components/
│   ├── ui/            reusable design-system components (Phase 1 + Phase 2: SearchInput,
│   │                   FilterSelect, Pagination, Drawer, JsonViewer, FormSection,
│   │                   SortableHeaderButton, Tabs)
│   ├── layout/         Sidebar, Topbar, dashboard widgets, PlaceholderPage
│   ├── navigation/      NavItem
│   └── feedback/        Toast notifications
├── config/brand.ts      centralized product name/tagline
├── contexts/AuthContext.tsx
├── layouts/             ControlLayout, CompanyLayout, UserLayout
├── mock/                mock users, companies, integrations, api logs, system logs,
│                        settings, activity, platform health
├── pages/
│   ├── auth/
│   ├── control/         Dashboard, Companies (+companies/), Integrations (+integrations/),
│   │                    ApiMonitoring (+monitoring/), SystemLogs (+logs/), Settings
│   ├── company/         unchanged since Phase 1 (placeholder pages)
│   └── user/            unchanged since Phase 1 (placeholder pages)
├── routes/              AppRoutes, ProtectedRoute
├── services/            mockAuth.ts, mockCompanyService.ts, mockIntegrationService.ts,
│                        mockApiMonitoringService.ts, mockSystemLogService.ts,
│                        mockSettingsService.ts, mockPlatformHealthService.ts,
│                        mockActivityService.ts, serviceUtils.ts (ServiceError, delay,
│                        cloneSeed)
├── types/               auth, common, company, integration, apiLog, systemLog,
│                        settings, activity
└── lib/                 permissions.ts, format.ts (date/number formatting),
                         statusBadges.ts (single source of truth for status → badge color)
```

## Security notes

Frontend role checks (`hasRole`, `hasPermission`, `ProtectedRoute`) exist for navigation
and UX only — they are **not** a security boundary. Once a real backend exists, it must
independently enforce authentication, authorization, tenant isolation, and API access
control on every request.

No real integration credentials (API keys, tokens, passwords, client secrets) are ever
captured beyond a component's local form state, and none are sent to or stored by any
mock service — only a `credentialsConfigured: boolean` flag is persisted. Real credential
capture, encryption, and storage is backend work for a later phase.

## Manual test checklist

**Phase 1 — auth & routing**

1. **Super Admin** — log in as `admin@tamotam.test`; lands on `/control/dashboard`;
   can reach every `/control/*` route; visiting `/company/*` or `/user/*` redirects to
   `/unauthorized`.
2. **Company Admin** — log in as `company@tamotam.test`; lands on `/company/dashboard`;
   can reach every `/company/*` route; `/control/*` and `/user/*` redirect to
   `/unauthorized`.
3. **Employee** — log in as `employee@tamotam.test`; lands on `/user/dashboard`; can
   reach every `/user/*` route; `/control/*` and `/company/*` redirect to `/unauthorized`.
4. **Unauthenticated** — open `/control/dashboard` in a fresh/incognito window (or after
   logging out) → redirected to `/login`.
5. **Refresh persistence** — log in, refresh the page → still logged in, still on the
   same panel.
6. **Logout** — use the avatar menu → logged out, redirected to `/login`, and protected
   routes become inaccessible again.
7. **Responsive** — resize the window (or use dev tools device mode) below ~1024px width
   and confirm the sidebar becomes a hamburger-triggered drawer on every panel.

**Phase 2 — Control Panel modules** (log in as Super Admin for all of these)

8. **Dashboard** — loads without hard-coded numbers; stat cards, integration health, and
   recent activity all reflect the mock data set.
9. **Companies** — search, filter by status/integration, sort every sortable column,
   paginate, add a company (appears immediately), edit a company, view its detail
   drawer, deactivate/reactivate, and delete (each destructive action asks for
   confirmation first).
10. **Integrations** — search/filter the list; open a company's drawer; edit
    Configuration and save; edit Field Mapping and save; run Test Connection and confirm
    both the drawer's Overview tab and the underlying list row update to the new status.
11. **API Monitoring** — stat cards match the table; search/filter by company, status
    group, and method; open a request's detail drawer and confirm headers/params/body
    render through the JSON viewer with masked auth values.
12. **System Logs** — search/filter by severity and resource; open a log's detail drawer
    and confirm metadata renders through the JSON viewer.
13. **Settings** — change a field in each section, confirm **Save/Cancel** only appear
    once something is dirty, save, refresh, and confirm the change persisted for the
    session (mock service state, resets on full reload).
14. **No regressions** — Company Admin and Employee panels behave exactly as in Phase 1.

## Known limitations (Phase 2 scope)

- All data is in-memory mock state that resets on page reload — nothing is persisted to
  a real database.
- "Test Connection" and API request logs are simulated; no real network calls are made
  to any provider.
- Settings' Security section is UI-only and not enforced anywhere in the app.
- No real-time updates — every list is refetched on demand, not pushed.

## Not yet built (future phases)

Real backend, database, JWT/OAuth, real API integrations and credential storage,
Company/Employee panel CRUD, leave processing, real reports, real notifications,
billing, and the mobile app are all out of scope for this phase.
