import { apiClient, type ApiSuccessResponse } from "./client";
import type { PlatformSettings, UpdateSettingsInput } from "../types/settings";

/**
 * Real Settings API — Super Admin only. Talks to
 * backend/src/settings/settings.controller.ts, mounted at /settings:
 *   GET   /settings
 *   PATCH /settings   (partial body — only the fields sent are changed)
 *
 * Drop-in replacement for services/mockSettingsService.ts — same
 * exported function names/signatures — the Settings page depends only on
 * those, never on how they're implemented.
 */

export async function getSettings(): Promise<PlatformSettings> {
  const response = await apiClient.get<ApiSuccessResponse<PlatformSettings>>("/settings");
  return response.data;
}

export async function updateSettings(input: UpdateSettingsInput): Promise<PlatformSettings> {
  const response = await apiClient.patch<ApiSuccessResponse<PlatformSettings>>("/settings", input);
  return response.data;
}
