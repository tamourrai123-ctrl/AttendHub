import * as bcrypt from 'bcryptjs';

/**
 * bcryptjs (a pure-JS bcrypt implementation) rather than native `bcrypt` —
 * chosen specifically to avoid native-module compilation on the team's
 * Windows development machine (see Phase 4G's own guidance). Cost factor 12
 * is bcrypt's commonly recommended minimum for 2025+ hardware; NEVER lower
 * this to make tests run faster — see hashPassword()'s callers in the e2e
 * suite, which accept the real cost.
 */
const SALT_ROUNDS = 12;

/** Hashes a plaintext password for storage. Never store the return value's input anywhere else, logged or otherwise. */
export async function hashPassword(plainTextPassword: string): Promise<string> {
  return bcrypt.hash(plainTextPassword, SALT_ROUNDS);
}

/**
 * Verifies a plaintext password against a stored hash. Fails closed (false,
 * never throws) on a malformed or missing hash — e.g. a legacy/placeholder
 * value that isn't a real bcrypt hash — rather than letting bcrypt.compare
 * throw and turn into a 500.
 */
export async function verifyPassword(plainTextPassword: string, hash: string | null | undefined): Promise<boolean> {
  if (!hash || !hash.startsWith('$2')) {
    return false;
  }
  return bcrypt.compare(plainTextPassword, hash);
}
