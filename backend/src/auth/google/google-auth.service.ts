import { Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';

export interface GoogleProfile {
  /** Lower-cased, Google-verified email address. */
  email: string;
  name: string;
}

const TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo';
const GOOGLE_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];
const REQUEST_TIMEOUT_MS = 8000;

/**
 * Verifies a Google Sign-In ID token (the credential the frontend's
 * "Continue with Google" button receives) by asking Google's own tokeninfo
 * endpoint — no extra npm dependency. Google checks the signature and
 * expiry; this class additionally checks that the token was issued for
 * THIS app (audience), by Google, and that Google has verified the email.
 *
 * Configured with GOOGLE_CLIENT_ID (comma-separate several client ids if the
 * web and mobile apps use different ones). Without it Google sign-in is
 * simply unavailable (503); email/password login is unaffected.
 */
@Injectable()
export class GoogleAuthService {
  private readonly logger = new Logger(GoogleAuthService.name);

  private allowedClientIds(): string[] {
    return (process.env.GOOGLE_CLIENT_ID ?? '')
      .split(',')
      .map((id: string) => id.trim())
      .filter(Boolean);
  }

  async verifyIdToken(idToken: string): Promise<GoogleProfile> {
    const clientIds = this.allowedClientIds();
    if (clientIds.length === 0) {
      throw new ServiceUnavailableException('Google sign-in is not configured on this server.');
    }

    let payload: Record<string, unknown>;
    try {
      const response = await fetch(`${TOKENINFO_URL}?id_token=${encodeURIComponent(idToken)}`, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new UnauthorizedException('Google sign-in failed. Please try again.');
      }
      payload = (await response.json()) as Record<string, unknown>;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      // Never log the token itself.
      this.logger.warn(`Google tokeninfo request failed: ${error instanceof Error ? error.message : 'unknown error'}`);
      throw new ServiceUnavailableException('Could not reach Google to verify the sign-in. Please try again.');
    }

    const audience = typeof payload.aud === 'string' ? payload.aud : '';
    const issuer = typeof payload.iss === 'string' ? payload.iss : '';
    const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
    const emailVerified = payload.email_verified === true || payload.email_verified === 'true';

    if (!clientIds.includes(audience) || !GOOGLE_ISSUERS.includes(issuer) || !email || !emailVerified) {
      throw new UnauthorizedException('Google sign-in failed. Please try again.');
    }

    const name = typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : email.split('@')[0];
    return { email, name };
  }
}
