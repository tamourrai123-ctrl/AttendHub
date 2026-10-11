import type { PlatformSettings } from "../types/settings";

export const DEFAULT_PLATFORM_SETTINGS: PlatformSettings = {
  notifications: {
    apiFailureAlerts: true,
    integrationWarnings: true,
    systemErrorAlerts: true,
  },
  security: {
    sessionTimeoutMinutes: 60,
    requireTwoStepLogin: false,
  },
};