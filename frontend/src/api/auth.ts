import type { AuthCredentials, Session, User } from "../types/auth";
import { apiClient, ApiError, type ApiMessageResponse, type ApiSuccessResponse } from "./client";
import { clearSession, persistSession, readPersistedSession } from "./session";

/**
 * Real authentication — Phase 4H. Talks to the actual backend routes built
 * in Phase 4G (see backend's auth.controller.ts): POST /auth/login,
 * GET /auth/me, POST /auth/logout, POST /auth/forgot-password.
 *
 * This module is a drop-in replacement for the old services/mockAuth.ts —
 * AuthContext depends only on these exported function signatures (login,
 * logout, readPersistedSession, AuthError), never on how they're
 * implemented, so no other file needed to change shape.
 *
 * The backend's login response shape (PublicAuthUser — see auth.service.ts)
 * already matches the frontend's `User` type field-for-field
 * (id/name/email/role/companyId?/companyName?/employeeId?), so no reshaping
 * happens here beyond assembling the local `Session` wrapper.
 */
export class AuthError extends Error {}

interface LoginResponseData {
  token: string;
  user: User;
}

export async function login(credentials: AuthCredentials): Promise<Session> {
  try {
    const response = await apiClient.post<ApiSuccessResponse<LoginResponseData>>("/auth/login", {
      email: credentials.email.trim(),
      password: credentials.password,
    });

    const session: Session = {
      user: response.data.user,
      token: response.data.token,
      issuedAt: new Date().toISOString(),
    };
    persistSession(session, credentials.rememberMe ?? true);
    return session;
  } catch (err) {
    if (err instanceof ApiError) {
      throw new AuthError(err.message);
    }
    throw err;
  }
}

/** Validates the current session against the server — used on app load to
 * confirm a locally-cached session hasn't been revoked/expired server-side. */
export async function getMe(): Promise<User> {
  const response = await apiClient.get<ApiSuccessResponse<User>>("/auth/me");
  return response.data;
}

export async function logout(): Promise<void> {
  try {
    await apiClient.post<ApiMessageResponse>("/auth/logout");
  } catch {
    // Best-effort: even if the network call fails (offline, or the token
    // was already invalid), the user must still be signed out locally —
    // logout must never get "stuck" waiting on the server.
  } finally {
    clearSession();
  }
}

/** Always resolves with the backend's generic message, whether or not the
 * email matched an account — the endpoint itself never reveals that (see
 * AuthService.forgotPassword's doc comment on the backend). */
export async function forgotPassword(email: string): Promise<string> {
  const response = await apiClient.post<ApiMessageResponse>("/auth/forgot-password", {
    email: email.trim(),
  });
  return response.message;
}

export { readPersistedSession };
