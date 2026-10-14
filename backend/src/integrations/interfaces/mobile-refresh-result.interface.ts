export interface MobileRefreshResult {
  /** A brand-new session token. The token that was sent in is revoked and must be discarded. */
  token: string;
  /** When the new token stops working (ISO 8601). */
  expiresAt: string;
}
