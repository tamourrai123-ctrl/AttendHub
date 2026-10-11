import { SetMetadata } from '@nestjs/common';
import { Role } from '../constants/roles.enum';

export const ROLES_KEY = 'roles';

/**
 * Restricts a route to the listed roles. Read by RolesGuard, which runs
 * globally on every request. A route with no @Roles() at all is open to any
 * authenticated user (still subject to AuthGuard) — use @Public() instead
 * for routes that need no authentication at all.
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
