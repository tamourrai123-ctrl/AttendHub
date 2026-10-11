import { MOCK_COMPANIES } from "../mock/companies";
import { cloneSeed, delay, generateId, ServiceError } from "./serviceUtils";

/**
 * RETIRED FROM THE COMPANIES MODULE (Phase 4H Step 4) — but NOT fully dead
 * yet. pages/control/Companies.tsx has been switched to ../api/companies,
 * the real backend client (GET/POST/PATCH/DELETE /companies).
 *
 * However, pages/control/Dashboard.tsx (the platform overview page) still
 * imports `getCompanies` from here for its aggregate stats card, and that
 * page is out of scope for this Companies-only step — it's still entirely
 * mock-driven (integrations, API summary, and activity feed on that page
 * are also mock), and switching only its company stats to real data would
 * leave it in an inconsistent half-real state. Do NOT delete this file (or
 * ../mock/companies.ts) until Dashboard.tsx is migrated in its own future
 * step and no longer imports it.
 *
 * NOTE: this file's own types (Company, CompanyListQuery, ...) were the
 * OLD mock shapes (no id/shortname/country on Company, filter/sort fields
 * on the query) and have been superseded by the real shapes now in
 * ../types/company.ts. Declared locally in this file (instead of importing
 * from ../types/company) so this file keeps compiling against its own mock
 * data — Dashboard.tsx imports the `Company` type it uses from here, not
 * from ../types/company, for the same reason.
 *
 * Mock data layer for Companies (original doc comment below, kept for
 * context on why it was written this way).
 *
 * Pages call this module, never the raw mock array — so `CompanyListQuery`
 * above already looks like a real `GET /companies` request, and swapping
 * this file for a `fetch`-based implementation later shouldn't require
 * touching any page.
 *
 * All state below lives in memory only. It resets on page reload.
 */
export type CompanyStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED";
export type IntegrationHealthStatus = "CONNECTED" | "DISCONNECTED" | "WARNING" | "ERROR" | "TESTING";

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
  createdAt: string;
  lastActivityAt: string;
}

export interface CreateCompanyInput {
  name: string;
  email: string;
  contactPerson: string;
  phone: string;
  status: CompanyStatus;
}

export type UpdateCompanyInput = Partial<CreateCompanyInput>;
export type CompanySortField = "name" | "employeeCount" | "createdAt" | "lastActivityAt";
export type SortDirection = "asc" | "desc";

export interface CompanyListQuery {
  search?: string;
  status?: CompanyStatus | "ALL";
  integrationStatus?: IntegrationHealthStatus | "ALL";
  sortField?: CompanySortField;
  sortDirection?: SortDirection;
  page?: number;
  pageSize?: number;
}

export interface CompanyListResult {
  items: Company[];
  total: number;
  page: number;
  pageSize: number;
}
let companies: Company[] = cloneSeed(MOCK_COMPANIES);

const NETWORK_DELAY_MS = 450;

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export async function getCompanies(query: CompanyListQuery = {}): Promise<CompanyListResult> {
  await delay(NETWORK_DELAY_MS);

  const {
    search = "",
    status = "ALL",
    integrationStatus = "ALL",
    sortField = "name",
    sortDirection = "asc",
    page = 1,
    pageSize = 10,
  } = query;

  let filtered = companies.filter((company) => {
    const matchesSearch =
      !search ||
      normalize(company.name).includes(normalize(search)) ||
      normalize(company.email).includes(normalize(search));
    const matchesStatus = status === "ALL" || company.status === status;
    const matchesIntegration = integrationStatus === "ALL" || company.integrationStatus === integrationStatus;
    return matchesSearch && matchesStatus && matchesIntegration;
  });

  filtered = [...filtered].sort((a, b) => {
    const direction = sortDirection === "asc" ? 1 : -1;
    switch (sortField) {
      case "employeeCount":
        return (a.employeeCount - b.employeeCount) * direction;
      case "createdAt":
        return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * direction;
      case "lastActivityAt":
        return (new Date(a.lastActivityAt).getTime() - new Date(b.lastActivityAt).getTime()) * direction;
      case "name":
      default:
        return a.name.localeCompare(b.name) * direction;
    }
  });

  const total = filtered.length;
  const start = (page - 1) * pageSize;
  const items = filtered.slice(start, start + pageSize);

  return { items, total, page, pageSize };
}

export async function getCompanyById(id: string): Promise<Company | undefined> {
  await delay(NETWORK_DELAY_MS);
  return companies.find((c) => c.id === id);
}

export async function createCompany(input: CreateCompanyInput): Promise<Company> {
  await delay(NETWORK_DELAY_MS);

  const duplicate = companies.some((c) => normalize(c.name) === normalize(input.name));
  if (duplicate) {
    throw new ServiceError(`A company named "${input.name}" already exists.`);
  }

  const now = new Date().toISOString();
  const created: Company = {
    id: generateId("cmp"),
    name: input.name.trim(),
    email: input.email.trim(),
    contactPerson: input.contactPerson.trim(),
    phone: input.phone.trim(),
    status: input.status,
    employeeCount: 0,
    activeEmployeeCount: 0,
    integrationStatus: "DISCONNECTED",
    createdAt: now,
    lastActivityAt: now,
  };

  companies = [created, ...companies];
  return created;
}

export async function updateCompany(id: string, input: UpdateCompanyInput): Promise<Company> {
  await delay(NETWORK_DELAY_MS);

  const index = companies.findIndex((c) => c.id === id);
  if (index === -1) {
    throw new ServiceError("This company no longer exists.");
  }

  if (input.name) {
    const duplicate = companies.some(
      (c) => c.id !== id && normalize(c.name) === normalize(input.name!)
    );
    if (duplicate) {
      throw new ServiceError(`A company named "${input.name}" already exists.`);
    }
  }

  const updated: Company = {
    ...companies[index],
    ...input,
    lastActivityAt: new Date().toISOString(),
  };
  companies = [...companies.slice(0, index), updated, ...companies.slice(index + 1)];
  return updated;
}

export async function updateCompanyStatus(id: string, status: Company["status"]): Promise<Company> {
  return updateCompany(id, { status });
}

export async function deleteCompany(id: string): Promise<void> {
  await delay(NETWORK_DELAY_MS);
  const exists = companies.some((c) => c.id === id);
  if (!exists) {
    throw new ServiceError("This company no longer exists.");
  }
  companies = companies.filter((c) => c.id !== id);
}
