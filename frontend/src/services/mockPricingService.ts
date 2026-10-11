import { MOCK_PRICING_PLANS } from "../mock/pricing";
import { MAX_PRICING_PLANS } from "../types/pricing";
import type { CreatePricingPlanInput, PricingPlan, UpdatePricingPlanInput } from "../types/pricing";
import { cloneSeed, delay, generateId, ServiceError } from "./serviceUtils";

/**
 * Mock data layer for public-website pricing plans.
 *
 * Intended future shape: a real backend would expose `GET /api/plans`
 * returning `{ plans: PricingPlan[] }` (active plans only, sorted by
 * `displayOrder`) for the public website to consume, and the Control Panel
 * would call authenticated CRUD endpoints that mirror the functions below.
 * Nothing here makes a real network request.
 */
let plans: PricingPlan[] = cloneSeed(MOCK_PRICING_PLANS);

const NETWORK_DELAY_MS = 450;

function sorted(list: PricingPlan[]): PricingPlan[] {
  return [...list].sort((a, b) => a.displayOrder - b.displayOrder);
}

function validate(input: Partial<CreatePricingPlanInput>) {
  if (input.name !== undefined && !input.name.trim()) {
    throw new ServiceError("Plan name is required.");
  }
  if (input.currency !== undefined && !input.currency.trim()) {
    throw new ServiceError("Currency is required.");
  }
  if (input.monthlyPrice !== undefined && (Number.isNaN(input.monthlyPrice) || input.monthlyPrice < 0)) {
    throw new ServiceError("Monthly price must be zero or a positive number.");
  }
  if (input.yearlyPrice !== undefined && (Number.isNaN(input.yearlyPrice) || input.yearlyPrice < 0)) {
    throw new ServiceError("Yearly price must be zero or a positive number.");
  }
  if (input.features !== undefined && input.features.filter((f) => f.trim()).length === 0) {
    throw new ServiceError("Add at least one feature.");
  }
}

/** If a plan is being marked recommended, every other plan loses the flag. */
function applyExclusiveRecommended(list: PricingPlan[], recommendedId: string): PricingPlan[] {
  return list.map((plan) => (plan.id === recommendedId ? plan : { ...plan, recommended: false }));
}

export async function getPricingPlans(): Promise<PricingPlan[]> {
  await delay(NETWORK_DELAY_MS);
  return sorted(plans);
}

export async function getPricingPlanById(id: string): Promise<PricingPlan | undefined> {
  await delay(NETWORK_DELAY_MS);
  return plans.find((plan) => plan.id === id);
}

export async function createPricingPlan(input: CreatePricingPlanInput): Promise<PricingPlan> {
  await delay(NETWORK_DELAY_MS);

  if (plans.length >= MAX_PRICING_PLANS) {
    throw new ServiceError(`You've reached the maximum of ${MAX_PRICING_PLANS} pricing plans.`);
  }
  validate(input);

  const nextOrder = plans.reduce((max, plan) => Math.max(max, plan.displayOrder), 0) + 1;
  const created: PricingPlan = {
    id: generateId("plan"),
    name: input.name.trim(),
    description: input.description.trim(),
    monthlyPrice: input.monthlyPrice,
    yearlyPrice: input.yearlyPrice,
    currency: input.currency.trim().toUpperCase(),
    features: input.features.map((f) => f.trim()).filter(Boolean),
    recommended: input.recommended,
    displayOrder: nextOrder,
    active: input.active,
  };

  plans = input.recommended ? applyExclusiveRecommended(plans, created.id) : [...plans];
  plans = [...plans, created];
  return created;
}

export async function updatePricingPlan(id: string, input: UpdatePricingPlanInput): Promise<PricingPlan> {
  await delay(NETWORK_DELAY_MS);

  const index = plans.findIndex((plan) => plan.id === id);
  if (index === -1) throw new ServiceError("This pricing plan no longer exists.");
  validate(input);

  const updated: PricingPlan = {
    ...plans[index],
    ...input,
    name: input.name !== undefined ? input.name.trim() : plans[index].name,
    description: input.description !== undefined ? input.description.trim() : plans[index].description,
    currency: input.currency !== undefined ? input.currency.trim().toUpperCase() : plans[index].currency,
    features: input.features !== undefined ? input.features.map((f) => f.trim()).filter(Boolean) : plans[index].features,
  };

  let nextPlans = [...plans.slice(0, index), updated, ...plans.slice(index + 1)];
  if (updated.recommended) {
    nextPlans = applyExclusiveRecommended(nextPlans, updated.id);
  }
  plans = nextPlans;

  return nextPlans.find((plan) => plan.id === id) as PricingPlan;
}

export async function setPricingPlanActive(id: string, active: boolean): Promise<PricingPlan> {
  return updatePricingPlan(id, { active });
}

export async function deletePricingPlan(id: string): Promise<void> {
  await delay(NETWORK_DELAY_MS);
  const exists = plans.some((plan) => plan.id === id);
  if (!exists) throw new ServiceError("This pricing plan no longer exists.");
  plans = plans.filter((plan) => plan.id !== id);
}

/** Swaps this plan's displayOrder with its neighbor in the given direction. */
export async function movePricingPlan(id: string, direction: "up" | "down"): Promise<PricingPlan[]> {
  await delay(NETWORK_DELAY_MS);

  const ordered = sorted(plans);
  const index = ordered.findIndex((plan) => plan.id === id);
  if (index === -1) throw new ServiceError("This pricing plan no longer exists.");

  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (swapWith < 0 || swapWith >= ordered.length) {
    return ordered;
  }

  const a = ordered[index];
  const b = ordered[swapWith];
  const aOrder = a.displayOrder;
  const bOrder = b.displayOrder;

  plans = plans.map((plan) => {
    if (plan.id === a.id) return { ...plan, displayOrder: bOrder };
    if (plan.id === b.id) return { ...plan, displayOrder: aOrder };
    return plan;
  });

  return sorted(plans);
}
