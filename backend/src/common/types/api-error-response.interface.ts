/**
 * Every error response the API returns, regardless of status code. Kept
 * intentionally minimal per the Phase 4B response-format requirement — no
 * stack traces, no internal error names, just enough for a client to show
 * something useful. The HTTP status code itself carries the category
 * (400/401/403/404/409/500); this body only carries the message.
 */
export interface ApiErrorResponse {
  success: false;
  message: string | string[];
}
