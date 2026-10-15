/** Mirrors the frontend's `PricingPlan` type (src/types/pricing.ts). */
export const MAX_PRICING_PLANS = 5;

/** A Super-Admin-defined extra on a plan (e.g. "Priority support": true). Shown on the website; only enforced if code checks its key. */
export type PlanCustomFeatureValue = string | number | boolean;

export interface PlanCustomFeature {
  /** Stable machine key, unique within the plan (e.g. "prioritySupport"). */
  key: string;
  /** Human label shown on pricing cards. */
  label: string;
  value: PlanCustomFeatureValue;
}

export interface PricingPlan {
  id: string;
  name: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  currency: string;
  features: string[];
  /** Only one plan may be recommended at a time — enforced by the service. */
  recommended: boolean;
  /** Lower numbers render first on the public website. */
  displayOrder: number;
  /** Inactive plans are hidden from GET /api/plans but keep their configuration. */
  active: boolean;
  /** Maximum number of mobile-app users (employees who connect and mark attendance). null = unlimited. */
  maxUsers: number | null;
  /** Free-trial length in days when a company first picks this plan. 0 = no trial. */
  trialDays: number;
  /** Dynamic, Super-Admin-defined extras. */
  customFeatures: PlanCustomFeature[];
}
