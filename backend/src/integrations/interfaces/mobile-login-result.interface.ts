/**
 * Response shape for POST /auth/mobile/login. Deliberately its own shape
 * rather than reusing auth.service.ts's PublicAuthUser/LoginResult — those
 * describe a web admin session (which can be SUPER_ADMIN or COMPANY_ADMIN,
 * neither relevant here) and carry no mobile-config data. Every mobile
 * login is an EMPLOYEE session; `token` works the same way everywhere else
 * in this app (a Bearer token against every other authenticated route,
 * including the existing employee-facing ones like POST
 * /integrations/attendance-punch and GET /attendance/me).
 */
export interface MobileLoginResult {
  token: string;
  employee: {
    /** The HR system's own employee id (nothing is stored in AttendHub). */
    id: string;
    name: string;
    companyId: string;
    companyName: string;
  };
}
