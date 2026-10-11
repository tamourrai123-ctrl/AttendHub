import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Minimal email abstraction for Phase 4G. There is no real email provider
 * wired up yet (SMTP/SendGrid/SES/etc. is explicitly out of scope for this
 * phase — see the "what NOT to build yet" list in the final report) — this
 * is a log-only implementation that satisfies the interface every caller
 * (AuthService) depends on, so swapping in a real provider later is a
 * single-file change with no ripple effect.
 *
 * SECURITY: this class NEVER logs the raw verification/reset token itself —
 * only that an email "would be sent", the recipient, and the link's path
 * (not its token query string). This mirrors the same "server logs full
 * detail, client/logs never see the sensitive value" pattern already used by
 * HttpExceptionFilter for unexpected errors. In this phase, since there is
 * no real inbox to receive the email, the one and only place the actual raw
 * token is observable is the HTTP response test doubles capture directly —
 * see EmailService's DI-override pattern in the e2e tests, which stub this
 * class to capture the token that would otherwise only ever be emailed.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly configService: ConfigService) {}

  async sendVerificationEmail(email: string, rawToken: string): Promise<void> {
    const link = `${this.frontendUrl()}/verify-email?token=${rawToken}`;
    // Only for local development visibility while there is no real email
    // provider — the raw token is intentionally omitted from this log line.
    this.logger.log(`Verification email would be sent to ${email} (link path: /verify-email?token=<redacted>)`);
    void link; // constructed here so a future real EmailService only has to swap the transport, not the link-building logic.
  }

  async sendPasswordResetEmail(email: string, rawToken: string): Promise<void> {
    const link = `${this.frontendUrl()}/reset-password?token=${rawToken}`;
    this.logger.log(`Password reset email would be sent to ${email} (link path: /reset-password?token=<redacted>)`);
    void link;
  }

  private frontendUrl(): string {
    return this.configService.get<string>('app.frontendUrl') ?? 'http://localhost:5173';
  }
}
