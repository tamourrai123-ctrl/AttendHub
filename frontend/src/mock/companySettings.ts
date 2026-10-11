import type { CompanySettings } from "../types/companySettings";

/**
 * MOCK DATA — development only. Seed data for `mockCompanySettingsService`.
 * Contact details match this company's Control Panel record (`mock/companies.ts`,
 * cmp_001) so the two views of the same company don't visibly disagree.
 */
export const MOCK_COMPANY_SETTINGS: CompanySettings[] = [
  {
    companyId: "cmp_001",
    companyName: "ABC Pvt Ltd",
    address: "12 Industrial Avenue, Karachi, Pakistan",
    contactPerson: "Bilal Ahmed",
    contactEmail: "ops@abc.test",
    contactPhone: "+92 300 1234567",
    preferences: { notifyOnAbsence: true, weeklySummaryEmail: true },
  },
  {
    companyId: "cmp_002",
    companyName: "XYZ Ltd",
    address: "45 Commerce Road, Lahore, Pakistan",
    contactPerson: "Fatima Noor",
    contactEmail: "it@xyz.test",
    contactPhone: "+92 300 2345678",
    preferences: { notifyOnAbsence: false, weeklySummaryEmail: true },
  },
];
