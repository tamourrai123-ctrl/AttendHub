import type { Company } from "../services/mockCompanyService";

/**
 * RETIRED FROM THE COMPANIES MODULE (Phase 4H Step 4) — but still used
 * indirectly via ../services/mockCompanyService.ts, which
 * pages/control/Dashboard.tsx (out of scope for this step) still imports
 * for its platform-overview stats. The Companies page itself now gets real
 * data from ../api/companies. Do NOT delete this file (or
 * mockCompanyService.ts) until Dashboard.tsx no longer imports that
 * service — see the longer explanation there.
 *
 * Note: `Company` here is imported from the retired mock service's own
 * local type (the OLD mock shape — no id/shortname/country), not from
 * ../types/company (which now holds the REAL backend shape). This keeps
 * this file compiling on its own without pretending the mock seed data
 * matches the real contract.
 *
 * MOCK DATA — development only (original doc comment below, kept for
 * context on why it was written this way).
 *
 * Deliberately varied statuses, integration health, employee counts and
 * dates so search/filter/sort/pagination/empty-state all have something
 * real to demonstrate.
 */
export const MOCK_COMPANIES: Company[] = [
  { id: "cmp_001", name: "ABC Pvt Ltd", email: "ops@abc.test", contactPerson: "Bilal Ahmed", phone: "+92 300 1234567", status: "ACTIVE", employeeCount: 250, activeEmployeeCount: 231, integrationStatus: "CONNECTED", createdAt: "2025-02-14T09:00:00Z", lastActivityAt: "2026-09-11T10:52:00Z" },
  { id: "cmp_002", name: "XYZ Ltd", email: "it@xyz.test", contactPerson: "Fatima Noor", phone: "+92 300 2345678", status: "ACTIVE", employeeCount: 612, activeEmployeeCount: 598, integrationStatus: "ERROR", createdAt: "2024-11-02T09:00:00Z", lastActivityAt: "2026-09-11T10:33:00Z" },
  { id: "cmp_003", name: "DEF Industries", email: "admin@defindustries.test", contactPerson: "Ahmed Raza", phone: "+92 300 3456789", status: "ACTIVE", employeeCount: 128, activeEmployeeCount: 120, integrationStatus: "CONNECTED", createdAt: "2025-06-30T09:00:00Z", lastActivityAt: "2026-09-11T08:15:00Z" },
  { id: "cmp_004", name: "Nova Textiles", email: "hr@novatextiles.test", contactPerson: "Sara Malik", phone: "+92 300 4567890", status: "INACTIVE", employeeCount: 340, activeEmployeeCount: 0, integrationStatus: "TESTING", createdAt: "2026-01-10T09:00:00Z", lastActivityAt: "2026-09-05T14:20:00Z" },
  { id: "cmp_005", name: "Skyline Foods", email: "contact@skylinefoods.test", contactPerson: "Usman Tariq", phone: "+92 300 5678901", status: "SUSPENDED", employeeCount: 89, activeEmployeeCount: 0, integrationStatus: "DISCONNECTED", createdAt: "2023-09-21T09:00:00Z", lastActivityAt: "2026-08-02T11:00:00Z" },
  { id: "cmp_006", name: "Horizon Tech", email: "ops@horizontech.test", contactPerson: "Zara Sheikh", phone: "+92 300 6789012", status: "ACTIVE", employeeCount: 1420, activeEmployeeCount: 1390, integrationStatus: "CONNECTED", createdAt: "2024-04-18T09:00:00Z", lastActivityAt: "2026-09-11T09:47:00Z" },
  { id: "cmp_007", name: "Coastal Logistics", email: "admin@coastallogistics.test", contactPerson: "Hamza Iqbal", phone: "+92 300 7890123", status: "ACTIVE", employeeCount: 305, activeEmployeeCount: 288, integrationStatus: "WARNING", createdAt: "2025-08-05T09:00:00Z", lastActivityAt: "2026-09-10T16:40:00Z" },
  { id: "cmp_008", name: "Bright Retail Group", email: "it@brightretail.test", contactPerson: "Mahnoor Aslam", phone: "+92 300 8901234", status: "ACTIVE", employeeCount: 764, activeEmployeeCount: 740, integrationStatus: "CONNECTED", createdAt: "2024-07-22T09:00:00Z", lastActivityAt: "2026-09-11T07:05:00Z" },
  { id: "cmp_009", name: "Pinnacle Construction", email: "hr@pinnacleconstruction.test", contactPerson: "Farhan Qureshi", phone: "+92 300 9012345", status: "ACTIVE", employeeCount: 512, activeEmployeeCount: 470, integrationStatus: "CONNECTED", createdAt: "2025-03-11T09:00:00Z", lastActivityAt: "2026-09-09T13:22:00Z" },
  { id: "cmp_010", name: "Riverbend Hospitality", email: "ops@riverbend.test", contactPerson: "Ayesha Baig", phone: "+92 300 0123456", status: "INACTIVE", employeeCount: 214, activeEmployeeCount: 0, integrationStatus: "DISCONNECTED", createdAt: "2024-12-01T09:00:00Z", lastActivityAt: "2026-07-14T10:00:00Z" },
  { id: "cmp_011", name: "Vantage Manufacturing", email: "admin@vantagemfg.test", contactPerson: "Bilal Chaudhry", phone: "+92 300 1122334", status: "ACTIVE", employeeCount: 980, activeEmployeeCount: 940, integrationStatus: "CONNECTED", createdAt: "2023-05-19T09:00:00Z", lastActivityAt: "2026-09-11T06:12:00Z" },
  { id: "cmp_012", name: "Crestwood Pharma", email: "it@crestwoodpharma.test", contactPerson: "Nida Farooq", phone: "+92 300 2233445", status: "ACTIVE", employeeCount: 176, activeEmployeeCount: 165, integrationStatus: "ERROR", createdAt: "2025-10-08T09:00:00Z", lastActivityAt: "2026-09-11T05:58:00Z" },
  { id: "cmp_013", name: "Lakeside Energy", email: "ops@lakesideenergy.test", contactPerson: "Owais Anwar", phone: "+92 300 3344556", status: "ACTIVE", employeeCount: 445, activeEmployeeCount: 430, integrationStatus: "CONNECTED", createdAt: "2024-02-27T09:00:00Z", lastActivityAt: "2026-09-08T12:30:00Z" },
  { id: "cmp_014", name: "Summit Education Trust", email: "admin@summited.test", contactPerson: "Rabia Yousaf", phone: "+92 300 4455667", status: "SUSPENDED", employeeCount: 62, activeEmployeeCount: 0, integrationStatus: "DISCONNECTED", createdAt: "2023-01-30T09:00:00Z", lastActivityAt: "2026-06-19T09:00:00Z" },
];
