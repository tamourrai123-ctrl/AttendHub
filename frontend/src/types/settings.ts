/**
 * Real Settings shape — matches the backend's PlatformSettings exactly
 * (backend/src/settings/interfaces/platform-settings.interface.ts).
 *
 * Deliberately narrower than the old mock shape: "Platform" (name/
 * description/timezone/dateFormat) and "System Preferences" (page size/
 * 24-hour time) are dropped entirely — nothing on the backend reads or
 * enforces them, so keeping them would just be UI decoration. Only
 * `security` and `notifications` remain, and only the fields that
 * actually do something (see each field's own comment below).
 */
export interface SecuritySettings {
  /** Minutes before a freshly-issued login session expires. Real — changes here affect the very next login. */
  sessionTimeoutMinutes: number;
  /** Stored preference only — nothing in the app enforces a second login step yet. */
  requireTwoStepLogin: boolean;
}

export interface NotificationSettings {
  /** When on, an ERROR/CRITICAL system log entry is logged to the backend's console as an alert. */
  systemErrorAlerts: boolean;
  /** When on, an API call logged with a 400+ status is logged to the backend's console as an alert. */
  apiFailureAlerts: boolean;
  /** When on, a company's integration going to Disconnected is logged to the backend's console as an alert. */
  integrationWarnings: boolean;
}

export interface PlatformSettings {
  security: SecuritySettings;
  notifications: NotificationSettings;
}

export type UpdateSettingsInput = Partial<{
  security: Partial<SecuritySettings>;
  notifications: Partial<NotificationSettings>;
}>;
