import type { PricingPlan } from "../types/pricing";

/** "Up to 50 app users" / "Unlimited app users". */
export function userLimitLabel(maxUsers: number | null): string {
  return maxUsers === null ? "Unlimited app users" : `Up to ${maxUsers} app users`;
}

/** "14-day free trial", or null when the plan has none. */
export function trialLabel(trialDays: number): string | null {
  return trialDays > 0 ? `${trialDays}-day free trial` : null;
}

/** "USD 29" — or "Free" for a zero price. */
export function monthlyPriceLabel(plan: Pick<PricingPlan, "currency" | "monthlyPrice">): string {
  return plan.monthlyPrice === 0 ? "Free" : `${plan.currency} ${plan.monthlyPrice}`;
}

/** One readable line per custom feature; an off (false) feature is left out. */
export function customFeatureLines(plan: Pick<PricingPlan, "customFeatures">): string[] {
  const lines: string[] = [];
  for (const feature of plan.customFeatures) {
    if (feature.value === false) continue;
    lines.push(feature.value === true ? feature.label : `${feature.label}: ${feature.value}`);
  }
  return lines;
}

/** Everything a plan offers, in the order people care about: users, trial, features, extras. */
export function planHighlights(plan: PricingPlan): string[] {
  const trial = trialLabel(plan.trialDays);
  return [userLimitLabel(plan.maxUsers), ...(trial ? [trial] : []), ...plan.features, ...customFeatureLines(plan)];
}
