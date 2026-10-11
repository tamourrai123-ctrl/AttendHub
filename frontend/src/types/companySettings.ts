/**
 * Company Admin's self-service settings. Deliberately separate from
 * `mockCompanyService`/`Company` (the Super Admin's Control Panel record for
 * this same company) — the two are managed by different roles for different
 * purposes, and coupling them would mean a Company Admin's settings save
 * could collide with Super Admin validation (e.g. platform-wide unique
 * company names) that has nothing to do with this form.
 *
 * Real-data note: confirmed against the backend's `usm_company` table
 * before this was wired up — it has no contactPerson/contactEmail/
 * contactPhone columns, and no notification-preference columns at all, so
 * the old mock version's "Contact Information" and "Preferences" fields had
 * nothing real to save to and were dropped. Fax/website/tax id fields ARE
 * real columns (previously unused anywhere in the app) and are included.
 */
export interface CompanySettings {
  companyId: string;
  companyName: string;
  address: string;
  phone: string;
  fax: string;
  website: string;
  gstNumber: string;
  ntnNumber: string;
}

export interface UpdateCompanySettingsInput {
  companyName?: string;
  address?: string;
  phone?: string;
  fax?: string;
  website?: string;
  gstNumber?: string;
  ntnNumber?: string;
}
