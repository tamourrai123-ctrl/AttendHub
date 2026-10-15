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

function toSession(data: LoginResponseData): Session {
  return { user: data.user, token: data.token, issuedAt: new Date().toISOString() };
}

function asAuthError(err: unknown): never {
  if (err instanceof ApiError) {
    throw new AuthError(err.message);
  }
  throw err;
}

export interface SignupInput {
  companyName: string;
  /** Short unique company name (max 10 characters) — employees use it to sign in on the mobile app. */
  companyShortname: string;
  adminName: string;
  email: string;
  password: string;
  /** The plan picked on the pricing step; omitted when no plans are published yet. */
  planId?: string;
}

/** Self-signup with email + password: creates the company and its first admin, and signs them in. */
export async function signup(input: SignupInput): Promise<Session> {
  try {
    const response = await apiClient.post<ApiSuccessResponse<LoginResponseData>>("/auth/signup", {
      companyName: input.companyName.trim(),
      companyShortname: input.companyShortname.trim(),
      adminName: input.adminName.trim(),
      email: input.email.trim(),
      password: input.password,
      ...(input.planId ? { planId: input.planId } : {}),
    });
    const session = toSession(response.data);
    persistSession(session, true);
    return session;
  } catch (err) {
    return asAuthError(err);
  }
}

/** What "Continue with Google" leads to: a signed-in session, or a request to finish signing up. */
export type GoogleLoginOutcome =
  | { status: "LOGGED_IN"; session: Session }
  | { status: "SIGNUP_REQUIRED"; signupToken: string; email: string; name: string };

type GoogleLoginResponseData =
  | ({ status: "LOGGED_IN" } & LoginResponseData)
  | { status: "SIGNUP_REQUIRED"; signupToken: string; email: string; name: string };

export async function loginWithGoogle(idToken: string): Promise<GoogleLoginOutcome> {
  try {
    const response = await apiClient.post<ApiSuccessResponse<GoogleLoginResponseData>>("/auth/google", { idToken });
    const data = response.data;
    if (data.status === "SIGNUP_REQUIRED") {
      return { status: "SIGNUP_REQUIRED", signupToken: data.signupToken, email: data.email, name: data.name };
    }
    const session = toSession(data);
    persistSession(session, true);
    return { status: "LOGGED_IN", session };
  } catch (err) {
    return asAuthError(err);
  }
}

export interface GoogleSignupInput {
  signupToken: string;
  companyName: string;
  companyShortname: string;
  planId?: string;
  adminName?: string;
}

/** Second step for a new Google user: creates the company + first admin and signs them in. */
export async function signupWithGoogle(input: GoogleSignupInput): Promise<Session> {
  try {
    const response = await apiClient.post<ApiSuccessResponse<LoginResponseData>>("/auth/google/signup", {
      signupToken: input.signupToken,
      companyName: input.companyName.trim(),
      companyShortname: input.companyShortname.trim(),
      ...(input.planId ? { planId: input.planId } : {}),
      ...(input.adminName?.trim() ? { adminName: input.adminName.trim() } : {}),
    });
    const session = toSession(response.data);
    persistSession(session, true);
    return session;
  } catch (err) {
    return asAuthError(err);
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
