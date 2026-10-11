/**
 * The success-response envelope every controller wraps its return value in.
 * Kept as a plain helper function (not a global interceptor) so each
 * controller method's return type is explicit and there's no risk of
 * double-wrapping an already-shaped body — see Phase 4B's response-format
 * requirement (`{ success: true, data }` / `{ success: true, message }`).
 */
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

export interface ApiMessageResponse {
  success: true;
  message: string;
}

export function ok<T>(data: T): ApiSuccessResponse<T> {
  return { success: true, data };
}

export function okMessage(message: string): ApiMessageResponse {
  return { success: true, message };
}
