import { clearSession, getToken } from "./session";

/**
 * Central HTTP client — Phase 4H.
 *
 * Every real API module (auth.ts, companies.ts, employees.ts, ...) goes
 * through this file instead of calling `fetch` directly. It is the ONE
 * place that:
 *   - resolves the backend base URL from env (VITE_API_BASE_URL)
 *   - attaches the JWT (if any) to every request
 *   - parses the backend's actual response envelope
 *     ({ success: true, data } / { success: true, message } /
 *      { success: false, message }) — see backend's api-response.dto.ts
 *      and http-exception.filter.ts, which this mirrors exactly
 *   - reacts to 401 by clearing the local session and notifying the app
 *
 * Never logs the token, the Authorization header, or request/response
 * bodies — errors surfaced to callers carry only a human-readable message
 * (and, for 400s, the backend's field-level messages), never raw payloads.
 */

// Dev falls back to the local backend; a production build (Vercel) falls back
// to the deployed backend, so a missing VITE_API_BASE_URL never points a live
// site at localhost.
const DEFAULT_BASE_URL = import.meta.env.PROD
  ? "https://tameotam-y5a6.vercel.app/api"
  : "http://localhost:3000/api";

function resolveBaseUrl(): string {
  const configured = import.meta.env.VITE_API_BASE_URL;
  const trimmed = typeof configured === "string" ? configured.trim() : "";
  return trimmed.length > 0 ? trimmed : DEFAULT_BASE_URL;
}

export const API_BASE_URL = resolveBaseUrl();

/** Dispatched on `window` whenever a request comes back 401, so AuthContext
 * can clear the signed-in user without every page having to handle it. */
export const SESSION_EXPIRED_EVENT = "attendhub:session-expired";

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

export interface ApiMessageResponse {
  success: true;
  message: string;
}

/** Thrown for every non-2xx response. `fieldErrors` is populated only when
 * the backend's `message` was an array (class-validator's shape for 400s). */
export class ApiError extends Error {
  readonly status: number;
  readonly fieldErrors?: string[];

  constructor(status: number, message: string, fieldErrors?: string[]) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

const FALLBACK_MESSAGES: Record<number, string> = {
  0: "Could not reach the server. Check your connection and try again.",
  400: "That request wasn't valid. Please check the form and try again.",
  401: "Your session has expired. Please log in again.",
  403: "You don't have permission to do that.",
  404: "The requested item could not be found.",
  409: "This conflicts with existing data.",
  429: "Too many requests — please slow down and try again.",
  500: "Something went wrong on the server. Please try again.",
};

export type QueryValue = string | number | boolean | undefined | null;
export type QueryParams = Record<string, QueryValue>;

function buildUrl(path: string, params?: QueryParams): string {
  const base = API_BASE_URL.endsWith("/") ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
  const cleanPath = path.startsWith("/") ? path : `/${path}`;

  if (!params) return `${base}${cleanPath}`;

  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    searchParams.set(key, String(value));
  }
  const query = searchParams.toString();
  return query ? `${base}${cleanPath}?${query}` : `${base}${cleanPath}`;
}

interface ParsedBody {
  message?: string | string[];
  [key: string]: unknown;
}

function safeParseJson(text: string): ParsedBody | undefined {
  if (!text) return undefined;
  try {
    return JSON.parse(text) as ParsedBody;
  } catch {
    return undefined;
  }
}

function extractMessage(payload: ParsedBody | undefined, status: number): { message: string; fieldErrors?: string[] } {
  if (payload && Array.isArray(payload.message) && payload.message.length > 0) {
    return { message: payload.message.join(" "), fieldErrors: payload.message };
  }
  if (payload && typeof payload.message === "string" && payload.message.length > 0) {
    return { message: payload.message };
  }
  return { message: FALLBACK_MESSAGES[status] ?? `Request failed (${status}).` };
}

interface RequestOptions {
  params?: QueryParams;
  body?: unknown;
  signal?: AbortSignal;
}

async function request<T>(method: "GET" | "POST" | "PATCH" | "DELETE", path: string, options: RequestOptions = {}): Promise<T> {
  const { params, body, signal } = options;
  const url = buildUrl(path, params);
  const token = getToken();

  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch {
    throw new ApiError(0, FALLBACK_MESSAGES[0]);
  }

  const text = await response.text();
  const payload = safeParseJson(text);

  if (!response.ok) {
    if (response.status === 401) {
      clearSession();
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }
    const { message, fieldErrors } = extractMessage(payload, response.status);
    throw new ApiError(response.status, message, fieldErrors);
  }

  return payload as T;
}

export const apiClient = {
  get: <T>(path: string, params?: QueryParams, signal?: AbortSignal) => request<T>("GET", path, { params, signal }),
  post: <T>(path: string, body?: unknown, signal?: AbortSignal) => request<T>("POST", path, { body, signal }),
  patch: <T>(path: string, body?: unknown, signal?: AbortSignal) => request<T>("PATCH", path, { body, signal }),
  delete: <T>(path: string, signal?: AbortSignal) => request<T>("DELETE", path, { signal }),
};
