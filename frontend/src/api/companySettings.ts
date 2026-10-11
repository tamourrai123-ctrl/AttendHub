import { apiClient, type ApiSuccessResponse } from "./client";
import type { CompanySettings, UpdateCompanySettingsInput } from "../types/companySettings";

/**
 * Real Company Settings API — the Company Admin's own "Company Settings"
 * page. Talks to the two Company-Admin-facing routes bolted onto
 * backend/src/companies/companies.controller.ts:
 *   GET   /companies/mine
 *   PATCH /companies/mine
 *
 * Both are always scoped server-side to the caller's own company (from the
 * JWT), never by a companyId passed from here — same pattern as
 * api/integrations.ts's getMyIntegration/createMyIntegration.
 *
 * Drop-in replacement for services/mockCompanySettingsService.ts: neither
 * function takes a companyId anymore (the old mock version did), since the
 * real backend never needs the caller to supply one.
 */

export async function getCompanySettings(): Promise<CompanySettings> {
  const response = await apiClient.get<ApiSuccessResponse<CompanySettings>>("/companies/mine");
  return response.data;
}

export async function updateCompanySettings(input: UpdateCompanySettingsInput): Promise<CompanySettings> {
  const response = await apiClient.patch<ApiSuccessResponse<CompanySettings>>("/companies/mine", input);
  return response.data;
}
