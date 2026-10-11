import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route as not requiring authentication at all — e.g. health check,
 * login, and the public pricing list. Read by both AuthGuard (skips token
 * validation entirely) and RolesGuard (skips the role check, since there is
 * no authenticated user to check a role against).
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
