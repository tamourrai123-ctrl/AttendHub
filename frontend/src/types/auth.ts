/**
 * Type-safe role & permission model.
 *
 * IMPORTANT: These frontend role/permission checks exist for navigation and
 * UX purposes only. They are NOT a security boundary — the backend
 * (AuthGuard/RolesGuard) is what actually enforces authentication,
 * authorization, and tenant isolation. These role strings match the
 * backend's Role enum exactly (see backend's roles.enum.ts) — never rename
 * them here without checking that file first.
 */

export type UserRole = "SUPER_ADMIN" | "COMPANY_ADMIN" | "EMPLOYEE";

export type Permission =
  | "CONTROL_PANEL_ACCESS"
  | "COMPANY_PANEL_ACCESS"
  | "USER_PANEL_ACCESS";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  /** Only present for company-related users (Company Admin, Employee). */
  companyId?: string;
  companyName?: string;
  /** Only present for Employees — links to their Employee record for attendance/profile lookups. */
  employeeId?: string;
  avatarUrl?: string;
}

export interface AuthCredentials {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface Session {
  user: User;
  /** A real backend JWT (Phase 4G/4H) — signed and verified server-side on
   * every request. Never decoded or trusted for anything on the frontend
   * beyond attaching it as a bearer token; the backend is the only source
   * of truth for who this token actually belongs to. */
  token: string;
  issuedAt: string;
}
