/**
 * Pricing plans shown on the public Tamotam website. Super Admin manages
 * these from the Control Panel. This shape already matches the real
 * backend exactly — see backend/src/pricing/interfaces/pricing-plan.interface.ts,
 * whose own comment says it mirrors this file.
 */

export const MAX_PRICING_PLANS = 5;

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
