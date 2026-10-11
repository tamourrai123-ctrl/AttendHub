/**
 * Platform-wide settings — Super Admin only.
 *
 * Scope is deliberately narrow (see the phase's own approval): only
 * settings that have a real, working effect somewhere are included.
 * "Platform Info", page size, and 24-hour-time were explicitly left out —
 * there is nothing behind them yet, and adding a toggle with no real
 * effect would just be a UI decoration.
 */
export interface SecuritySettings {
  /**
   * Minutes before a freshly-issued login session expires. Drives both the
   * signed JWT's expiry and the DB-backed session row's expiresAt — see
   * AuthService.issueSession() and PrismaSessionsRepository.create(), both
   * of which used to read a hardcoded constant (SESSION_TTL_SECONDS) and
   * now read this instead.
   */
  sessionTimeoutMinutes: number;

  /**
   * Stored preference only — nothing in the app enforces a second step at
   * login yet. Kept here (rather than dropped) so the toggle a Super Admin
   * sets isn't silently lost, and so a future phase that actually builds
   * 2-step verification has a real setting to read from on day one.
   */
  requireTwoStepLogin: boolean;
}

export interface NotificationSettings {
  /** Gates the console-log alert in SystemLogsService.record() for an ERROR/CRITICAL entry. */
  systemErrorAlerts: boolean;
  /** Gates the console-log alert in MonitoringService.record() for a logged call with statusCode >= 400. */
  apiFailureAlerts: boolean;
  /** Gates the console-log alert in IntegrationsService.setStatusForCompany() when a company's integration goes DISCONNECTED. */
  integrationWarnings: boolean;
}

export interface PlatformSettings {
  security: SecuritySettings;
  notifications: NotificationSettings;
}

/**
 * sessionTimeoutMinutes defaults to 1440 (24 hours) to exactly match the
 * previous hardcoded SESSION_TTL_SECONDS (60 * 60 * 24) — switching to real
 * settings must not silently change existing session lifetimes on deploy.
 * All three notification toggles default on, matching today's behavior
 * (every one of these already happens, just without a console.log).
 */
export const DEFAULT_PLATFORM_SETTINGS: PlatformSettings = {
  security: {
    sessionTimeoutMinutes: 1440,
    requireTwoStepLogin: false,
  },
  notifications: {
    systemErrorAlerts: true,
    apiFailureAlerts: true,
    integrationWarnings: true,
  },
};

/** Keys `SettingsService.notifyIfEnabled()` accepts — one per NotificationSettings field. */
export type NotificationKind = keyof NotificationSettings;
