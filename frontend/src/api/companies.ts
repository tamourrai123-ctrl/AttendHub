import { apiClient, type ApiMessageResponse, type ApiSuccessResponse } from "./client";
import type {
  Company,
  CompanyListQuery,
  CompanyListResult,
  CreateCompanyInput,
  UpdateCompanyInput,
} from "../types/company";

/**
 * Real Companies API — Phase 4H Step 4. Talks to the actual backend routes
 * in backend/src/companies/companies.controller.ts (all `@Roles(Role.SUPER_ADMIN)`):
 *   GET    /companies            (query: page, limit)
 *   GET    /companies/:id
 *   POST   /companies
 *   PATCH  /companies/:id
 *   DELETE /companies/:id
 *
 * This module is a drop-in replacement for the old
 * services/mockCompanyService.ts — the Companies page and its form modal
 * depend only on these exported function signatures, never on how they're
 * implemented.
 *
 * The backend does NOT support server-side `search`, `status`, or `sort`
 * query params on the list endpoint (confirmed by inspecting
 * companies.controller.ts / PaginationQueryDto and the e2e spec) — only
 * `page`/`limit` are real. Do not add those params here; sending them would
 * silently do nothing (they're not whitelisted DTO fields on the query, so
 * they're just ignored), which would be misleading rather than helpful.
 */

interface RawCompanyListData {
  items: Company[];
  meta: { page: number; limit: number; total: number };
}

export async function getCompanies(query: CompanyListQuery = {}): Promise<CompanyListResult> {
  const response = await apiClient.get<ApiSuccessResponse<RawCompanyListData>>("/companies", {
    page: query.page,
    limit: query.limit,
  });
  const { items, meta } = response.data;
  return { items, page: meta.page, limit: meta.limit, total: meta.total };
}

/**
 * Not currently called anywhere in the Companies UI: the list response
 * already carries every field the details drawer displays, so fetching a
 * single company by id would be an unnecessary extra request. Exported
 * anyway since it's a real, valid endpoint and a thin, correct wrapper
 * around it costs nothing.
 */
export async function getCompanyById(id: string): Promise<Company> {
  const response = await apiClient.get<ApiSuccessResponse<Company>>(`/companies/${encodeURIComponent(id)}`);
  return response.data;
}

export async function createCompany(input: CreateCompanyInput): Promise<Company> {
  const response = await apiClient.post<ApiSuccessResponse<Company>>("/companies", input);
  return response.data;
}

/**
 * `input` must never contain `id` — enforced at the type level by
 * `UpdateCompanyInput` (see types/company.ts), which mirrors the real
 * `UpdateCompanyDto` that omits it entirely.
 */
export async function updateCompany(id: string, input: UpdateCompanyInput): Promise<Company> {
  const response = await apiClient.patch<ApiSuccessResponse<Company>>(`/companies/${encodeURIComponent(id)}`, input);
  return response.data;
}

export async function updateCompanyStatus(id: string, status: Company["status"]): Promise<Company> {
  return updateCompany(id, { status });
}

/** Resolves with the backend's confirmation message (`okMessage(...)`). */
export async function deleteCompany(id: string): Promise<string> {
  const response = await apiClient.delete<ApiMessageResponse>(`/companies/${encodeURIComponent(id)}`);
  return response.message;
}
