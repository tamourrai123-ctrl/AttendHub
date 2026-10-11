import { MOCK_ACCOUNTS } from "../mock/users";
import type { AuthCredentials, Session, User } from "../types/auth";

/**
 * RETIRED (Phase 4H) — no longer imported anywhere. AuthContext now uses
 * ../api/auth, which talks to the real backend (POST /auth/login,
 * GET /auth/me, POST /auth/logout). Left on disk rather than deleted, since
 * this session has no way to remove files from your machine — safe to
 * delete by hand once you've confirmed nothing else references it.
 *
 * Mock authentication service (original doc comment below, kept for
 * context on why it was written this way).
 *
 * This simulates a network round-trip and returns a fake session/token.
 * It is intentionally the ONLY place in the app that knows about the mock
 * account list, so swapping this file for a real API client later (e.g.
 * `POST /auth/login`) requires no changes anywhere else — AuthContext only
 * depends on this module's function signatures, not its implementation.
 */

const SESSION_STORAGE_KEY = "attendhub.session";
const MOCK_NETWORK_DELAY_MS = 500;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createMockToken(user: User): string {
  return `mock.${user.role.toLowerCase()}.${btoa(user.id)}.${Date.now()}`;
}

export class AuthError extends Error {}

export async function login(credentials: AuthCredentials): Promise<Session> {
  await delay(MOCK_NETWORK_DELAY_MS);

  const normalizedEmail = credentials.email.trim().toLowerCase();
  const account = MOCK_ACCOUNTS.find(
    (entry) => entry.user.email.toLowerCase() === normalizedEmail
  );

  if (!account || account.password !== credentials.password) {
    throw new AuthError("Invalid email or password. Please try again.");
  }

  const session: Session = {
    user: account.user,
    token: createMockToken(account.user),
    issuedAt: new Date().toISOString(),
  };

  persistSession(session, credentials.rememberMe ?? true);
  return session;
}

export async function logout(): Promise<void> {
  await delay(150);
  localStorage.removeItem(SESSION_STORAGE_KEY);
  sessionStorage.removeItem(SESSION_STORAGE_KEY);
}

function persistSession(session: Session, remember: boolean) {
  const serialized = JSON.stringify(session);
  if (remember) {
    localStorage.setItem(SESSION_STORAGE_KEY, serialized);
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } else {
    sessionStorage.setItem(SESSION_STORAGE_KEY, serialized);
    localStorage.removeItem(SESSION_STORAGE_KEY);
  }
}

export function readPersistedSession(): Session | null {
  const raw =
    localStorage.getItem(SESSION_STORAGE_KEY) ??
    sessionStorage.getItem(SESSION_STORAGE_KEY);

  if (!raw) return null;

  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}
