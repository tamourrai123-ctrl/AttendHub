import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { PrismaSessionsRepository } from '../repositories/prisma-sessions.repository';

/**
 * Global guard — runs on every request except those marked @Public().
 *
 * Authentication is DB-session-backed, not pure JWT verification:
 * PrismaSessionsRepository.findByToken() is the single source of truth for
 * "is this token currently valid" (not revoked, not expired), which is what
 * makes logout/password-reset/password-change able to genuinely invalidate
 * a session — a bare JWT can't be revoked once issued.
 *
 * When the bearer token looks like a JWT (three dot-separated segments —
 * true for every token AuthService issues), its signature and expiry are
 * ALSO verified via JwtService before the DB lookup, so a tampered or
 * expired token is rejected without even reaching PrismaSessionsRepository.
 * This check is skipped for tokens that don't have that shape — needed so
 * the fixed, non-JWT test tokens several existing e2e suites use to
 * override PrismaSessionsRepository directly (see employees.e2e-spec.ts /
 * integrations.e2e-spec.ts, both predating Phase 4G and explicitly not to
 * be broken by it) keep working: those tokens were never signed by
 * JwtService and were never meant to be.
 *
 * This is the ONLY place a request's identity is established; everything
 * downstream (RolesGuard, @CurrentUser(), every tenant-scoping check)
 * trusts request.user and nothing the client sent in the body/query.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly sessionsRepository: PrismaSessionsRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user: AuthenticatedUser }>();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header.');
    }

    const token = authHeader.slice('Bearer '.length).trim();

    if (looksLikeJwt(token)) {
      try {
        await this.jwtService.verifyAsync(token);
      } catch {
        throw new UnauthorizedException('Session is invalid or has expired.');
      }
    }

    const session = await this.sessionsRepository.findByToken(token);

    if (!session) {
      throw new UnauthorizedException('Session is invalid or has expired.');
    }

    request.user = {
      userId: session.userId,
      role: session.role,
      companyId: session.companyId,
      employeeId: session.employeeId,
    };

    return true;
  }
}

function looksLikeJwt(token: string): boolean {
  return token.split('.').length === 3;
}
