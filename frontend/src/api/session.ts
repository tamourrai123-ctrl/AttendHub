import type { Session, User } from "../types/auth";

/**
 * Session persistence — Phase 4H.
 *
 * Same storage key and localStorage/sessionStorage "remember me" split as
 * the old mock auth service (services/mockAuth.ts), so the only thing that
 * actually changed is WHAT gets stored: `token` is now a real backend JWT
 * instead of a fake `mock.<role>.<id>.<timestamp>` string.
 *
 * This is the ONE place that reads/writes the session in browser storage —
 * client.ts (to attach the Authorization header) and api/auth.ts (to
 * persist on login and clear on logout/expiry) both go through it rather
 * than touching localStorage/sessionStorage directly.
 */

const SESSION_STORAGE_KEY = "attendhub.session";

export function readPersistedSession(): Session | null {
  const raw = localStorage.getItem(SESSION_STORAGE_KEY) ?? sessionStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function getToken(): string | null {
  return readPersistedSession()?.token ?? null;
}

export function persistSession(session: Session, remember: boolean): void {
  const serialized = JSON.stringify(session);
  if (remember) {
    localStorage.setItem(SESSION_STORAGE_KEY, serialized);
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } else {
    sessionStorage.setItem(SESSION_STORAGE_KEY, serialized);
    localStorage.removeItem(SESSION_STORAGE_KEY);
  }
}

/** Refreshes the cached user (e.g. after GET /auth/me confirms the session
 * is still good) without changing which storage it lives in or the token. */
export function updateSessionUser(user: User): void {
  const existing = readPersistedSession();
  if (!existing) return;
  const remember = localStorage.getItem(SESSION_STORAGE_KEY) !== null;
  persistSession({ ...existing, user }, remember);
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_STORAGE_KEY);
  sessionStorage.removeItem(SESSION_STORAGE_KEY);
}
