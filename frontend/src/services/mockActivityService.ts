import { PLATFORM_ACTIVITY } from "../mock/activity";
import type { PlatformActivityItem } from "../types/activity";
import { delay } from "./serviceUtils";

export async function getRecentPlatformActivity(): Promise<PlatformActivityItem[]> {
  await delay(300);
  return PLATFORM_ACTIVITY;
}
