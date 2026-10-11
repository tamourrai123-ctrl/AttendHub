import { Role } from '../constants/roles.enum';

/**
 * The identity NestJS attaches to `request.user` once AuthGuard has
 * validated a request's bearer token. Every controller that needs to know
 * "who is calling this" and "which company do they belong to" reads it via
 * the @CurrentUser() decorator instead of trusting anything the client sent
 * in the body or query string — this is what makes tenant isolation
 * enforceable server-side (see companies/employees/attendance/leave
 * services, which all filter by `companyId` taken from here, never from a
 * request parameter).
 */
export interface AuthenticatedUser {
  userId: string;
  role: Role;
  /** Present for COMPANY_ADMIN and EMPLOYEE; absent (undefined) for SUPER_ADMIN. */
  companyId?: string;
  /** Present only for EMPLOYEE — links to their Employee record. */
  employeeId?: string;
}
