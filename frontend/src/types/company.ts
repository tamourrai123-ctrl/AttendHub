/**
 * Company domain types — Phase 4H Step 4 (real backend integration).
 *
 * These shapes are the REAL backend contract, confirmed by direct
 * inspection of:
 *   - backend/src/companies/dto/create-company.dto.ts / update-company.dto.ts
 *   - backend/src/companies/repositories/prisma-companies.repository.ts
 *     (specifically `toCompany()`, the single source of the response shape)
 *   - backend/test/companies.e2e-spec.ts (the "Field exposure" test, which
 *     asserts the exact response key list)
 *
 * They intentionally do NOT match the old mock `Company`/`CreateCompanyInput`
 * shapes field-for-field:
 *   - `id` is now part of `CreateCompanyInput` — the real backend requires
 *     the caller (Super Admin) to supply the primary key (1-2 characters;
 *     see the comment on `CreateCompanyInput.id` below), it is never
 *     generated client-side or server-side.
 *   - `shortname` and `country` are new, required, real columns that did
 *     not exist in the mock model at all.
 *   - Sorting/searching/status-filtering query params do NOT exist on the
 *     real `GET /companies` endpoint (it only accepts `page`/`limit`), so
 *     `CompanySortField` and the old `CompanyListQuery` filter fields have
 *     been removed rather than kept as dead/misleading UI hooks. `SortDirection`
 *     is kept only because `components/ui/SortableHeaderButton.tsx` (a
 *     generic, shared table-header component still used by other modules)
 *     imports it from here — Companies itself no longer uses that component.
 */

export type CompanyStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED";

/**
 * Coarse integration health, shared between a company's summary card and
 * its underlying Integration record. Computed live by the backend from
 * `integration_master` — never stored directly on the company row.
 */
export type IntegrationHealthStatus = "CONNECTED" | "DISCONNECTED" | "WARNING" | "ERROR" | "TESTING";

/** Kept only because `SortableHeaderButton` (shared UI, other modules) imports it. */
export type SortDirection = "asc" | "desc";

/**
 * The real, complete `Company` response shape. Nothing else is ever
 * returned by the backend (see the e2e "Field exposure" test) — in
 * particular there is no `logo` field, and `email`/`contactPerson` are
 * derived per-request from that company's admin user, not stored directly.
 */
export interface Company {
  id: string;
  name: string;
  email: string;
  contactPerson: string;
  phone: string;
  status: CompanyStatus;
  employeeCount: number;
  activeEmployeeCount: number;
  integrationStatus: IntegrationHealthStatus;
  /** ISO timestamp */
  createdAt: string;
  /** ISO timestamp of the most recent activity attributed to this company */
  lastActivityAt: string;
  /** Short, unique label for the company. Max 10 characters. */
  shortname: string;
  /** Numeric country code. No country LOV/lookup exists in this system yet — see api/companies.ts. */
  country: number;
}

/**
 * Real `CreateCompanyDto` fields.
 *
 * `id`: the Super Admin supplies this — it is the caller-chosen primary
 * key. The backend DTO constraint is `@Length(1, 2)` (1 TO 2 characters),
 * not "exactly 2" — validated client-side to match, with the backend as
 * final authority.
 */
export interface CreateCompanyInput {
  id: string;
  name: string;
  shortname: string;
  email: string;
  contactPerson: string;
  phone: string;
  status: CompanyStatus;
  country: number;
}

/**
 * Real `UpdateCompanyDto` — `PartialType(OmitType(CreateCompanyDto, ['id']))`.
 * `id` is intentionally NOT part of this type: it is immutable after
 * creation, and the backend's `forbidNonWhitelisted: true` validation
 * rejects any PATCH body that includes it.
 */
export type UpdateCompanyInput = Partial<Omit<CreateCompanyInput, "id">>;

/**
 * Discriminated union so the form modal and the page that calls the real
 * `createCompany`/`updateCompany` API functions stay in sync on which
 * shape applies, without an `id` ever being able to leak into an update
 * payload by accident.
 */
export type CompanyFormSubmission =
  | { mode: "create"; input: CreateCompanyInput }
  | { mode: "update"; input: UpdateCompanyInput };

/**
 * Real `GET /companies` only accepts `page`/`limit` — no `search`,
 * `status`, or `sort` query params exist on the backend.
 */
export interface CompanyListQuery {
  page?: number;
  limit?: number;
}

/** Mirrors the real `{ items, meta: { page, limit, total } }` envelope. */
export interface CompanyListResult {
  items: Company[];
  page: number;
  limit: number;
  total: number;
}
