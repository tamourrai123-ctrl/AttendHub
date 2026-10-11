import type { PlatformSettings } from "../types/settings";

/** MOCK DATA — development only. Seed/default state for `mockSettingsService`. */
export const DEFAULT_PLATFORM_SETTINGS: PlatformSettings = {
  platform: {
    name: "Tamotam",
    description: "Attendance Integration Platform",
    timezone: "Asia/Karachi",
    dateFormat: "DD MMM YYYY",
  },
  notifications: {
    apiFailureAlerts: true,
    integrationWarnings: true,
    systemErrorAlerts: true,
  },
  security: {
    sessionTimeoutMinutes: 60,
    loginProtectionEnabled: true,
  },
  system: {
    defaultPageSize: 10,
    use24HourTime: false,
  },
};
