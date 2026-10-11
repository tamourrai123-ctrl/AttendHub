/**
 * True when a mapping's HR-side sourcePath reads a token field (access/refresh
 * token, or a bare "token"), e.g. "items[].access_token". Used by HrLookupService
 * to refuse the device-info call outright if an admin mapped one: the purpose's
 * fixed field list only restricts the hub-side TARGET name, not what is read
 * from the HR response, so a token could otherwise be copied into an allowed
 * field. Expiry/id fields ("access_token_expiry", "token_id") are NOT matched —
 * only a path segment that is exactly a token name.
 */
const TOKEN_SEGMENT = /^(?:(?:access|refresh)[_-]?token|token)$/i;

export function isTokenSourcePath(sourcePath: string): boolean {
  return sourcePath
    .split('.')
    .map((segment) => segment.replace(/\[\]/g, ''))
    .some((segment) => TOKEN_SEGMENT.test(segment));
}
