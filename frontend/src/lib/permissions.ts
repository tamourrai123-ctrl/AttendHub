import type { Permission, UserRole } from "../types/auth";

/**
 * Foundation permission matrix. Phase 1 only needs a coarse
 * "which panel can this role open" mapping, but the shape is deliberately
 * a role -> permissions[] lookup so a future phase can add more granular
 * permissions (e.g. "COMPANIES_CREATE", "REPORTS_EXPORT") without touching
 * any of the call sites that use hasPermission().
 */
const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  SUPER_ADMIN: ["CONTROL_PANEL_ACCESS"],
  COMPANY_ADMIN: ["COMPANY_PANEL_ACCESS"],
  EMPLOYEE: ["USER_PANEL_ACCESS"],
};

export function getPermissionsForRole(role: UserRole): Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function roleHasPermission(role: UserRole, permission: Permission): boolean {
  return getPermissionsForRole(role).includes(permission);
}

/** Default landing route per role after login. */
export const ROLE_HOME_ROUTE: Record<UserRole, string> = {
  SUPER_ADMIN: "/control/dashboard",
  COMPANY_ADMIN: "/company/dashboard",
  EMPLOYEE: "/login",
};

export const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: "Super Admin",
  COMPANY_ADMIN: "Company Admin",
  EMPLOYEE: "Employee",
};
