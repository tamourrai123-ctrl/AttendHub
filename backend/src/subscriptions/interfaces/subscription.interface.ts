import { PricingPlan } from '../../pricing/interfaces/pricing-plan.interface';

export type PlanStatus = 'TRIAL' | 'ACTIVE';

/** The raw plan-related columns of one usm_company row. */
export interface CompanyPlanRow {
  planId: string | null;
  planStatus: PlanStatus | null;
  planStartedAt: Date | null;
  trialEndsAt: Date | null;
}

/** Values written to usm_company when a plan is assigned (shape matches the Prisma columns). */
export interface PlanAssignment {
  plan_id: bigint;
  plan_status: PlanStatus;
  plan_started_at: Date;
  trial_ends_at: Date | null;
}

export type RegisterSeatResult = 'EXISTING' | 'ADDED' | 'LIMIT_REACHED';

export interface MobileAppUser {
  externalEmployeeId: string;
  name: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
}

/** What GET /subscription/mine returns. */
export interface CompanySubscription {
  companyId: string;
  /** null for a legacy company that was never put on a plan — no limits apply to it. */
  plan: PricingPlan | null;
  /** 'NONE' = legacy company without a plan. */
  status: PlanStatus | 'NONE';
  planStartedAt: string | null;
  trialEndsAt: string | null;
  trialExpired: boolean;
  /** Whole days left in the trial (0 once expired); null when not on a trial. */
  trialDaysLeft: number | null;
  usage: { activeAppUsers: number; maxUsers: number | null; seatsLeft: number | null };
  /** false when the free trial has ended — the mobile app is blocked until a plan is chosen. */
  canUseMobileApp: boolean;
}
