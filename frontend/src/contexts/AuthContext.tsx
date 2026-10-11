import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { AuthCredentials, Permission, User, UserRole } from "../types/auth";
import { AuthError, getMe, login as loginRequest, logout as logoutRequest } from "../api/auth";
import { clearSession, readPersistedSession } from "../api/session";
import { SESSION_EXPIRED_EVENT } from "../api/client";
import { roleHasPermission } from "../lib/permissions";

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  /** True only while the initial session is being restored/validated. */
  isInitializing: boolean;
  /** True while a login request is in flight. */
  isLoggingIn: boolean;
  error: string | null;
  login: (credentials: AuthCredentials) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
  hasRole: (role: UserRole | UserRole[]) => boolean;
  hasPermission: (permission: Permission) => boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Session restoration: a token in localStorage/sessionStorage only means
  // "this browser was signed in before" — it says nothing about whether
  // that session is still valid (it may have been revoked by a password
  // reset/change, an explicit logout on another tab, or simply expired).
  // GET /auth/me is the actual source of truth; the cached user is shown
  // immediately just to avoid a flash of the login page while that
  // confirmation is in flight.
  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      const existing = readPersistedSession();
      if (!existing) {
        setIsInitializing(false);
        return;
      }

      setUser(existing.user);
      try {
        const freshUser = await getMe();
        if (!cancelled) setUser(freshUser);
      } catch {
        if (!cancelled) {
          clearSession();
          setUser(null);
        }
      } finally {
        if (!cancelled) setIsInitializing(false);
      }
    }

    restoreSession();
    return () => {
      cancelled = true;
    };
  }, []);

  // A 401 from ANY API call (not just auth endpoints) means the session is
  // no longer valid — client.ts clears the stored session and fires this
  // event so the app reacts uniformly instead of every page having its own
  // "am I still logged in" handling. ProtectedRoute then redirects to
  // /login on the next render because isAuthenticated becomes false.
  useEffect(() => {
    function handleSessionExpired() {
      setUser(null);
    }
    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
  }, []);

  const login = useCallback(async (credentials: AuthCredentials) => {
    setIsLoggingIn(true);
    setError(null);
    try {
      const session = await loginRequest(credentials);
      setUser(session.user);
    } catch (err) {
      const message =
        err instanceof AuthError
          ? err.message
          : "Something went wrong while signing in. Please try again.";
      setError(message);
      throw err;
    } finally {
      setIsLoggingIn(false);
    }
  }, []);

  const logout = useCallback(async () => {
    await logoutRequest();
    setUser(null);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const hasRole = useCallback(
    (role: UserRole | UserRole[]) => {
      if (!user) return false;
      return Array.isArray(role) ? role.includes(user.role) : user.role === role;
    },
    [user]
  );

  const hasPermission = useCallback(
    (permission: Permission) => {
      if (!user) return false;
      return roleHasPermission(user.role, permission);
    },
    [user]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: user !== null,
      isInitializing,
      isLoggingIn,
      error,
      login,
      logout,
      clearError,
      hasRole,
      hasPermission,
    }),
    [user, isInitializing, isLoggingIn, error, login, logout, clearError, hasRole, hasPermission]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
