import { MOCK_PLATFORM_HEALTH, type PlatformHealthComponent } from "../mock/platformHealth";
import { delay } from "./serviceUtils";

export async function getPlatformHealth(): Promise<PlatformHealthComponent[]> {
  await delay(300);
  return MOCK_PLATFORM_HEALTH;
}
