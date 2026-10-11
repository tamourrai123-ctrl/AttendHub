/**
 * Small shared helpers for the mock service layer.
 *
 * Every mock*Service module simulates a network round trip (so loading
 * states are real, not instant) and throws a typed `ServiceError` for
 * failure paths, so pages can `catch` a predictable shape the same way
 * they would a failed `fetch`.
 */

export class ServiceError extends Error {}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Deep-clones mock seed data so services can safely mutate their in-memory copies. */
export function cloneSeed<T>(seed: T): T {
  return JSON.parse(JSON.stringify(seed)) as T;
}

export function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}
