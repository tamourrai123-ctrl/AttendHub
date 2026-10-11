import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';

/**
 * Injects the authenticated user AuthGuard attached to the request.
 * Controllers use this instead of ever reading a companyId/employeeId the
 * client supplied — that's what makes tenant isolation and the
 * attendance/me self-scoping rules actually enforceable server-side.
 *
 * Only usable on routes that pass through AuthGuard (i.e. anything not
 * marked @Public()); on a public route this would be undefined.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest<Request & { user: AuthenticatedUser }>();
    return request.user;
  },
);
