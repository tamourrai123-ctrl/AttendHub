/**
 * Company Admin's self-service "Company Settings" view. Deliberately
 * separate from `Company` (companies/interfaces/company.interface.ts) — that
 * shape is the Super Admin's Control Panel record (employee counts,
 * integration status, platform-level status, etc., all Super-Admin-only
 * concerns). This one is just the profile fields a Company Admin is allowed
 * to see/edit about their own company, backed directly by scalar columns on
 * `usm_company` — no derived/aggregate data, no cross-tenant validation.
 *
 * Scope note (confirmed against the real schema before building this):
 * usm_company has no contactPerson/contactEmail/contactPhone columns, and no
 * notification-preference columns at all — the old mock Settings page's
 * "Contact Information" and "Preferences" cards had nothing real to back
 * them. What IS real and unused elsewhere in the app: fax, website, and the
 * GST/NTN tax id fields, included here. (The mobile-attendance-app config
 * cluster — geo-fencing, selfie mandatory, wifi validation, etc. — is also
 * real but out of scope for this pass; left for a future Settings section.)
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
