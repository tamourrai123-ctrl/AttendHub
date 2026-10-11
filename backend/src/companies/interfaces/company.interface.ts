/**
 * Mirrors the frontend's `Company` type (src/types/company.ts) exactly, so
 * the React app's Control Panel can eventually point at this API without
 * any reshaping of the response.
 */
export type CompanyStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
export type IntegrationHealthStatus = 'CONNECTED' | 'DISCONNECTED' | 'WARNING' | 'ERROR' | 'TESTING';

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
  /**
   * usm_company.shortname (required + unique in Postgres) and
   * usm_company.country (a required lookup id — see companies module
   * notes on the Country LOV). Declared optional here only so the
   * now-unused InMemoryCompaniesRepository (kept for reference, no longer
   * wired into CompaniesModule) still compiles without seeding fake
   * values for columns it was never built to have. The Postgres-backed
   * repository always populates both.
   */
  shortname?: string;
  country?: number;
}
