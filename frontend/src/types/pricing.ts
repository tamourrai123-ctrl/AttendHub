/**
 * Pricing plans shown on the public Tamotam website and chosen by companies
 * at signup. Super Admin manages these from the Control Panel. This shape
 * matches the real backend exactly — see
 * backend/src/pricing/interfaces/pricing-plan.interface.ts.
 */

export const MAX_PRICING_PLANS = 5;

/** A Super-Admin-defined extra on a plan. Only shown unless the backend checks its key. */
export type PlanFeatureValue = string | number | boolean;

export interface PlanCustomFeature {
  /** Stable machine key, unique within the plan. */
  key: string;
  label: string;
  value: PlanFeatureValue;
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
  /** Inactive plans are hidden from the public website but keep their configuration. */
  active: boolean;
  /** Maximum mobile-app users (employees who sign in and mark attendance). null = unlimited. */
  maxUsers: number | null;
  /** Free-trial days when a company first picks this plan. 0 = no trial. */
  trialDays: number;
  customFeatures: PlanCustomFeature[];
}

export interface CreatePricingPlanInput {
  name: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  currency: string;
  features: string[];
  recommended: boolean;
  active: boolean;
  /** Omit or null = unlimited. */
  maxUsers?: number | null;
  trialDays?: number;
  customFeatures?: PlanCustomFeature[];
}

/**
 * displayOrder is only settable through an update, never on create — the
 * backend assigns it automatically when a plan is created (see
 * UpdatePlanDto, which is the only one of the two real backend DTOs that
 * carries it). Used by the "move up/down" reorder action.
 */
export type UpdatePricingPlanInput = Partial<CreatePricingPlanInput> & {
  displayOrder?: number;
};
