import { DEFAULT_PLATFORM_SETTINGS } from "../mock/settings";
import type { PlatformSettings, UpdateSettingsInput } from "../types/settings";
import { cloneSeed, delay, ServiceError } from "./serviceUtils";

let settings: PlatformSettings = cloneSeed(DEFAULT_PLATFORM_SETTINGS);

const NETWORK_DELAY_MS = 450;

export async function getSettings(): Promise<PlatformSettings> {
  await delay(NETWORK_DELAY_MS);
  return settings;
}

export async function updateSettings(input: UpdateSettingsInput): Promise<PlatformSettings> {
  await delay(NETWORK_DELAY_MS);

  if (input.platform?.name !== undefined && input.platform.name.trim().length === 0) {
    throw new ServiceError("Platform name cannot be empty.");
  }

  settings = {
    platform: { ...settings.platform, ...input.platform },
    notifications: { ...settings.notifications, ...input.notifications },
    security: { ...settings.security, ...input.security },
    system: { ...settings.system, ...input.system },
  };
  return settings;
}
