import type { User } from "../types/auth";

/**
 * MOCK / DEMO DATA — development only.
 *
 * These accounts exist purely so Phase 1 can demonstrate the full
 * authentication and role-routing flow without a backend. They must be
 * replaced by real authentication before any non-development use.
 */
export interface MockAccount {
  user: User;
  password: string;
}

export const MOCK_ACCOUNTS: MockAccount[] = [
  {
    password: "admin123",
    user: {
      id: "usr_super_admin",
      name: "Rai Tamour",
      email: "admin@tamotam.test",
      role: "SUPER_ADMIN",
    },
  },
  {
    password: "company123",
    user: {
      id: "usr_company_admin",
      name: "Bilal Ahmed",
      email: "company@tamotam.test",
      role: "COMPANY_ADMIN",
      companyId: "cmp_001",
      companyName: "ABC Pvt Ltd",
    },
  },
];

export const DEMO_CREDENTIAL_HINTS = [
  { role: "Super Admin", email: "admin@tamotam.test", password: "admin123" },
  { role: "Company Admin", email: "company@tamotam.test", password: "company123" },
] as const;
