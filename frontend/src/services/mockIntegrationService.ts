import { MOCK_INTEGRATIONS } from "../mock/integrations";
import type { MockFieldMapping, MockIntegration, MockTestConnectionResult, MockUpdateIntegrationInput } from "../types/mockIntegration";
import { cloneSeed, delay, ServiceError } from "./serviceUtils";

/**
 * Mock data layer for Integrations.
 *
 * Still mock-driven on purpose: the real Super Admin "Integrations" screen
 * (pages/control/Integrations.tsx) now talks to api/integrations.ts
 * instead, and no longer imports anything from this file. This service
 * remains only for the Dashboard's "Integration Health" panel, which is
 * its own separate future migration step (see Dashboard.tsx's comment) —
 * so its types were split out to types/mockIntegration.ts (`MockIntegration`
 * etc.) rather than sharing the real `Integration` type, which no longer
 * has the fake fields (provider, lastSyncAt, lastTestResult, lastTestedAt,
 * fieldMappings, 5-value status) this mock data still relies on.
 *
 * SECURITY NOTE (Phase 2 scope): this module intentionally never accepts or
 * stores real API keys, tokens, or secrets — only a `credentialsConfigured`
 * boolean. Real credential capture, encryption, and storage is backend
 * work for a later phase; building it here would risk shipping a false
 * sense of security around secrets that are, in Phase 2, just UI state.
 */
let integrations: MockIntegration[] = cloneSeed(MOCK_INTEGRATIONS);

const NETWORK_DELAY_MS = 450;

export async function getIntegrations(): Promise<MockIntegration[]> {
  await delay(NETWORK_DELAY_MS);
  return integrations;
}

export async function getIntegrationById(id: string): Promise<MockIntegration | undefined> {
  await delay(NETWORK_DELAY_MS);
  return integrations.find((i) => i.id === id);
}

export async function getIntegrationByCompanyId(companyId: string): Promise<MockIntegration | undefined> {
  await delay(NETWORK_DELAY_MS);
  return integrations.find((i) => i.companyId === companyId);
}

export async function updateIntegration(id: string, input: MockUpdateIntegrationInput): Promise<MockIntegration> {
  await delay(NETWORK_DELAY_MS);
  const index = integrations.findIndex((i) => i.id === id);
  if (index === -1) throw new ServiceError("This integration no longer exists.");

  const updated: MockIntegration = { ...integrations[index], ...input };
  integrations = [...integrations.slice(0, index), updated, ...integrations.slice(index + 1)];
  return updated;
}

export async function updateFieldMapping(id: string, fieldMappings: MockFieldMapping[]): Promise<MockIntegration> {
  await delay(NETWORK_DELAY_MS);
  const index = integrations.findIndex((i) => i.id === id);
  if (index === -1) throw new ServiceError("This integration no longer exists.");

  const updated: MockIntegration = { ...integrations[index], fieldMappings };
  integrations = [...integrations.slice(0, index), updated, ...integrations.slice(index + 1)];
  return updated;
}

const FAILURE_MESSAGES = [
  "Unable to connect to the configured endpoint.",
  "The request timed out while waiting for a response.",
  "The provider rejected the credentials.",
];

/**
 * Simulates a "Test Connection" click. No network request is made — this
 * resolves with a randomized (but weighted-realistic) outcome purely so the
 * UI can demonstrate its loading/success/failure states.
 */
export async function testIntegrationConnection(id: string): Promise<MockTestConnectionResult> {
  const index = integrations.findIndex((i) => i.id === id);
  if (index === -1) throw new ServiceError("This integration no longer exists.");

  // A slightly longer, variable delay reads as a real connection attempt.
  await delay(900 + Math.round(Math.random() * 700));

  const currentStatus = integrations[index].status;
  const baseSuccessChance = currentStatus === "ERROR" || currentStatus === "DISCONNECTED" ? 0.35 : 0.85;
  const success = Math.random() < baseSuccessChance;
  const testedAt = new Date().toISOString();

  const result: MockTestConnectionResult = success
    ? { success: true, message: "Connection successful.", responseTimeMs: 90 + Math.round(Math.random() * 220), testedAt }
    : { success: false, message: FAILURE_MESSAGES[Math.floor(Math.random() * FAILURE_MESSAGES.length)], testedAt };

  const updated: MockIntegration = {
    ...integrations[index],
    status: success ? "CONNECTED" : "ERROR",
    lastTestResult: success ? "PASSED" : "FAILED",
    lastTestedAt: testedAt,
    lastSyncAt: success ? testedAt : integrations[index].lastSyncAt,
  };
  integrations = [...integrations.slice(0, index), updated, ...integrations.slice(index + 1)];

  return result;
}
