import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Role } from '../../common/constants/roles.enum';
import { Session } from '../interfaces/session.interface';
import { hashToken } from '../utils/token.util';

/**
 * PrismaSessionsRepository — replaces InMemorySessionsRepository (see the
 * Phase 4G final report for why this is a rename, not an in-place edit: the
 * old name was actively misleading once sessions are real, DB-backed rows).
 * Every e2e file that used to override InMemorySessionsRepository has been
 * mechanically updated to override this class instead — see
 * employees.e2e-spec.ts / integrations.e2e-spec.ts / integration-endpoints.
 * e2e-spec.ts / integration-field-mappings.e2e-spec.ts.
 *
 * Deliberately NOT foreign-keyed to usm_users (see
 * scripts/add-real-authentication-columns.ts's own comment on
 * usm_user_sessions): AuthService.login() still accepts the three legacy
 * hardcoded demo accounts as a backward-compatibility bridge (see
 * AuthService's class doc comment), and those accounts have no usm_users
 * row at all. Only the SHA-256 hash of a token is ever persisted — the raw
 * JWT itself is never written to the database.
 *
 * The `Session` interface's shape (token/userId/role/companyId/employeeId/
 * issuedAt) is UNCHANGED from the old InMemorySessionsRepository — this
 * repository is a drop-in replacement for the class, not a new contract.
 *
 * ttlSeconds (Settings module): create() used to compute expiresAt from a
 * hardcoded SESSION_TTL_SECONDS constant. It now takes the TTL as a
 * parameter instead, so the caller (AuthService.issueSession()) is the one
 * place that decides the value — by reading it from SettingsService — and
 * this repository stays a pure "persist what I'm given" class with no
 * settings-module dependency of its own.
 */
@Injectable()
export class PrismaSessionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Records a session for a token that AuthService has ALREADY signed (via
   * JwtService) — this repository never mints a token itself, only
   * persists that one exists so it can later be looked up or revoked.
   */
  async create(payload: Omit<Session, 'issuedAt'>, ttlSeconds: number): Promise<Session> {
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + ttlSeconds * 1000);

    await this.prisma.usm_user_sessions.create({
      data: {
        user_key: payload.userId,
        role: payload.role,
        company_id: payload.companyId ?? null,
        employee_id: payload.employeeId ?? null,
        token_hash: hashToken(payload.token),
        issued_at: issuedAt,
        expires_at: expiresAt,
      },
    });

    return { ...payload, issuedAt: issuedAt.toISOString() };
  }

  /** Only ever returns an active session: not revoked, and not past its own expiry — a caller never has to separately re-check either. */
  async findByToken(token: string): Promise<Session | undefined> {
    const row = await this.prisma.usm_user_sessions.findFirst({
      where: { token_hash: hashToken(token), revoked_at: null, expires_at: { gt: new Date() } },
    });
    if (!row) return undefined;

    return {
      token,
      userId: row.user_key,
      role: row.role as Role,
      companyId: row.company_id ?? undefined,
      employeeId: row.employee_id ?? undefined,
      issuedAt: row.issued_at.toISOString(),
    };
  }

  /** Idempotent: revoking an already-revoked or unknown token is a no-op, matching InMemorySessionsRepository's old Map.delete() behavior. */
  async revoke(token: string): Promise<void> {
    await this.prisma.usm_user_sessions.updateMany({
      where: { token_hash: hashToken(token), revoked_at: null },
      data: { revoked_at: new Date() },
    });
  }

  /**
   * Revokes every active session belonging to one user — called on
   * password reset/change so a token issued before the credential rotation
   * can't go on being used after it (a stolen/leaked-but-not-yet-noticed
   * session is exactly what a password change is meant to invalidate).
   */
  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.usm_user_sessions.updateMany({
      where: { user_key: userId, revoked_at: null },
      data: { revoked_at: new Date() },
    });
  }
}
