import { createHash, randomBytes, randomUUID } from 'crypto';

/**
 * Shared helpers for every single-use security token this module issues —
 * email verification, password reset, and session identifiers. The pattern
 * is always the same and is deliberately uniform across all three: generate
 * a high-entropy random value, hand the RAW value to the caller exactly
 * once (to email or to the client), and persist only its SHA-256 hash.
 * Nothing that reaches a database column, a log line, or a system_logs
 * entry is ever the raw token — see EmailService and PrismaUsersRepository/
 * PrismaSessionsRepository, which only ever accept/return hashes.
 */

/** 32 random bytes (256 bits) as hex — used for email-verification and password-reset tokens. */
export function generateRawToken(): string {
  return randomBytes(32).toString('hex');
}

/** SHA-256 hex digest of a raw token. One-way: this module never reverses a hash back to its raw token. */
export function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

/** A random session/JWT id (jti) — not secret on its own (it rides inside the signed JWT), but unique per issued token. */
export function generateSessionId(): string {
  return randomUUID();
}
