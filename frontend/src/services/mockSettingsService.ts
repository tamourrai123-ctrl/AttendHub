import { DEFAULT_PLATFORM_SETTINGS } from "../mock/settings";
import type {
  PlatformSettings,
  UpdateSettingsInput,
} from "../types/settings";
import { cloneSeed, delay } from "./serviceUtils";

let settings: PlatformSettings = cloneSeed(DEFAULT_PLATFORM_SETTINGS);

const NETWORK_DELAY_MS = 450;

export async function getSettings(): Promise<PlatformSettings> {
  await delay(NETWORK_DELAY_MS);
  return settings;
}

export async function updateSettings(
  input: UpdateSettingsInput,
): Promise<PlatformSettings> {
  await delay(NETWORK_DELAY_MS);

  settings = {
    notifications: {
      ...settings.notifications,
      ...input.notifications,
    },
    security: {
      ...settings.security,
      ...input.security,
    },
  };

  return settings;
}