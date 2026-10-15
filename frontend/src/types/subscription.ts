import type { PricingPlan } from "./pricing";

export type PlanStatus = "TRIAL" | "ACTIVE";

/** Mirrors backend/src/subscriptions/interfaces/subscription.interface.ts (CompanySubscription). */
export interface CompanySubscription {
  companyId: string;
  /** null for an older company that was never put on a plan — no limits apply. */
  plan: PricingPlan | null;
  status: PlanStatus | "NONE";
  planStartedAt: string | null;
  trialEndsAt: string | null;
  trialExpired: boolean;
  /** Whole days left in the trial; null when not on a trial. */
  trialDaysLeft: number | null;
  usage: { activeAppUsers: number; maxUsers: number | null; seatsLeft: number | null };
  /** false once the free trial has ended — the mobile app is paused until a plan is chosen. */
  canUseMobileApp: boolean;
}

/** An employee holding a mobile-app seat on the company's plan. */
export interface AppUser {
  externalEmployeeId: string;
  name: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
}
