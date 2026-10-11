import { MOCK_COMPANY_SETTINGS } from "../mock/companySettings";
import type { CompanySettings, UpdateCompanySettingsInput } from "../types/companySettings";
import { cloneSeed, delay, ServiceError } from "./serviceUtils";

/**
 * Mock data layer for the Company Admin's own Settings page. Intentionally
 * separate from `mockCompanyService` (see types/companySettings.ts) — no
 * billing/subscription fields here, and no Super Admin data.
 */
let settings: CompanySettings[] = cloneSeed(MOCK_COMPANY_SETTINGS);

const NETWORK_DELAY_MS = 450;

export async function getCompanySettings(companyId: string): Promise<CompanySettings | undefined> {
  await delay(NETWORK_DELAY_MS);
  return settings.find((s) => s.companyId === companyId);
}

export async function updateCompanySettings(companyId: string, input: UpdateCompanySettingsInput): Promise<CompanySettings> {
  await delay(NETWORK_DELAY_MS);

  const index = settings.findIndex((s) => s.companyId === companyId);
  if (index === -1) {
    throw new ServiceError("Settings for this company could not be found.");
  }

  const current = settings[index];
  const updated: CompanySettings = {
  ...current,
  ...input,
};
  settings = [...settings.slice(0, index), updated, ...settings.slice(index + 1)];
  return updated;
}
