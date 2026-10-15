import { apiClient, type ApiMessageResponse, type ApiSuccessResponse } from "./client";
import type { CreatePricingPlanInput, PricingPlan, UpdatePricingPlanInput } from "../types/pricing";

/**
 * Real Pricing API — Super Admin's plan management screen. Talks to the
 * actual backend routes in backend/src/pricing/plans.controller.ts, mounted
 * at /plans (not /pricing) to match its own spec:
 *   GET    /plans/all   (Super Admin — every plan, including inactive ones)
 *   POST   /plans       (Super Admin)
 *   PATCH  /plans/:id   (Super Admin)
 *   DELETE /plans/:id   (Super Admin)
 *
 * This module is a drop-in replacement for the old
 * services/mockPricingService.ts — same exported function names/signatures
 * — the Pricing page depends only on those, never on how they're implemented.
 *
 * types/pricing.ts already matches the backend's real PricingPlan shape
 * exactly (see pricing-plan.interface.ts's own comment, which says it
 * mirrors this frontend type) — no type changes were needed here, unlike
 * Integrations.
 *
 * GET /plans/all returns plans in raw storage order, not sorted by
 * displayOrder (only the public GET /plans sorts) — see
 * InMemoryPlansRepository.findAll() vs findActive(). Sorted client-side
 * here, same as the old mock service did.
 */

function sorted(list: PricingPlan[]): PricingPlan[] {
  return [...list].sort((a, b) => a.displayOrder - b.displayOrder);
}

/** Public list of ACTIVE plans (no sign-in needed) — what a new company picks from at signup. */
export async function getPublicPlans(): Promise<PricingPlan[]> {
  const response = await apiClient.get<ApiSuccessResponse<PricingPlan[]>>("/plans");
  return sorted(response.data);
}

export async function getPricingPlans(): Promise<PricingPlan[]> {
  const response = await apiClient.get<ApiSuccessResponse<PricingPlan[]>>("/plans/all");
  return sorted(response.data);
}

export async function createPricingPlan(input: CreatePricingPlanInput): Promise<PricingPlan> {
  const response = await apiClient.post<ApiSuccessResponse<PricingPlan>>("/plans", input);
  return response.data;
}

export async function updatePricingPlan(id: string, input: UpdatePricingPlanInput): Promise<PricingPlan> {
  const response = await apiClient.patch<ApiSuccessResponse<PricingPlan>>(`/plans/${encodeURIComponent(id)}`, input);
  return response.data;
}

export async function setPricingPlanActive(id: string, active: boolean): Promise<PricingPlan> {
  return updatePricingPlan(id, { active });
}

/** Resolves with the backend's confirmation message (`okMessage(...)`). */
export async function deletePricingPlan(id: string): Promise<string> {
  const response = await apiClient.delete<ApiMessageResponse>(`/plans/${encodeURIComponent(id)}`);
  return response.message;
}

/**
 * The real backend has no dedicated "reorder" endpoint — this swaps
 * displayOrder between the plan and its neighbor with two PATCH calls
 * (same effect as the old mock's in-memory swap), then re-fetches the
 * freshly sorted list.
 */
export async function movePricingPlan(id: string, direction: "up" | "down"): Promise<PricingPlan[]> {
  const all = await getPricingPlans();
  const index = all.findIndex((plan) => plan.id === id);
  if (index === -1) return all;

  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (swapWith < 0 || swapWith >= all.length) {
    return all;
  }

  const a = all[index];
  const b = all[swapWith];

  await Promise.all([
    updatePricingPlan(a.id, { displayOrder: b.displayOrder }),
    updatePricingPlan(b.id, { displayOrder: a.displayOrder }),
  ]);

  return getPricingPlans();
}
