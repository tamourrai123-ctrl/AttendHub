/** Mirrors the frontend's `PricingPlan` type (src/types/pricing.ts). */
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
  /** Inactive plans are hidden from GET /api/plans but keep their configuration. */
  active: boolean;
}
