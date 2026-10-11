export type PlatformHealthState = "operational" | "degraded" | "mock";

export interface PlatformHealthComponent {
  name: string;
  state: PlatformHealthState;
  note?: string;
}

/**
 * MOCK DATA — development only.
 *
 * There is no real backend, so these are NOT live health checks. They are
 * clearly labeled "mock" where nothing real exists yet, and the data layer
 * (mockPlatformHealthService) is separated from the UI so it can be
 * replaced by a real health-check endpoint later without touching the
 * Dashboard page.
 */
export const MOCK_PLATFORM_HEALTH: PlatformHealthComponent[] = [
  { name: "API Gateway", state: "mock", note: "No real gateway exists yet — Phase 4" },
  { name: "Integration Engine", state: "mock", note: "No real integration engine exists yet — Phase 4" },
  { name: "Database", state: "mock", note: "Frontend runs on mock data — Phase 4" },
  { name: "Authentication", state: "operational", note: "Mock session auth is functioning as designed" },
];
