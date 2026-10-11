import { Role } from '../../common/constants/roles.enum';

/**
 * A single logged-in session. As of Phase 4G, `token` is a real, signed JWT
 * (see AuthService, which signs it via @nestjs/jwt) and this interface's
 * shape is persisted — hashed, never in plaintext — by
 * PrismaSessionsRepository (see that class; it replaces the old
 * InMemorySessionsRepository). The shape itself is UNCHANGED from the
 * pre-Phase-4G version on purpose: every e2e test file that stubs a
 * sessions repository with fixed `Session` object literals keeps compiling
 * unmodified.
 */
export interface Session {
  token: string;
  userId: string;
  role: Role;
  companyId?: string;
  employeeId?: string;
  issuedAt: string;
}
