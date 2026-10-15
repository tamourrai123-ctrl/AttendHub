import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PricingPlan } from '../pricing/interfaces/pricing-plan.interface';
import { PrismaPlansRepository } from '../pricing/repositories/prisma-plans.repository';
import { SystemLogsService } from '../system-logs/system-logs.service';
import { PrismaSubscriptionsRepository } from './repositories/prisma-subscriptions.repository';
import { CompanySubscription, MobileAppUser, PlanAssignment } from './interfaces/subscription.interface';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Links companies to pricing plans and enforces the plan's limits.
 *
 * - A company picks an ACTIVE plan at signup (or later, via changePlan).
 *   If the plan has trialDays > 0 and the company has never had a plan, it
 *   starts a free TRIAL; otherwise the plan is ACTIVE straight away.
 *   (No payment gateway yet: choosing/upgrading a plan takes effect
 *   immediately. The payment step will slot into assignPlan() later.)
 * - The plan's maxUsers caps the number of distinct employees that have
 *   connected through the mobile app (mobile_app_users rows).
 * - When a trial runs out, the MOBILE APP is blocked (login, refresh,
 *   punch) — the company admin can still sign in to the portal to choose a
 *   plan.
 * - A legacy company with no plan (plan_id NULL) has no limits and is
 *   never blocked.
 * - Limits are read live from the plan, so a Super Admin editing a plan's
 *   maxUsers affects every company on it immediately.
 */
@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly repository: PrismaSubscriptionsRepository,
    private readonly plansRepository: PrismaPlansRepository,
    private readonly systemLogsService: SystemLogsService,
  ) {}

  // ---------- plan assignment ----------

  /** Loads a plan a company may choose: it must exist and be active. */
  private async loadChoosablePlan(planId: string): Promise<PricingPlan> {
    const plan = await this.plansRepository.findById(planId);
    if (!plan) throw new NotFoundException('Pricing plan not found.');
    if (!plan.active) throw new BadRequestException('This pricing plan is not available.');
    return plan;
  }

  private toAssignment(plan: PricingPlan, withTrial: boolean, now: Date): PlanAssignment {
    const startTrial = withTrial && plan.trialDays > 0;
    return {
      plan_id: BigInt(plan.id),
      plan_status: startTrial ? 'TRIAL' : 'ACTIVE',
      plan_started_at: now,
      trial_ends_at: startTrial ? new Date(now.getTime() + plan.trialDays * DAY_MS) : null,
    };
  }

  /**
   * For signup: validates the chosen plan and returns the usm_company
   * columns to write when the company row is created (a first-time company
   * always gets the plan's trial, if it has one). Returns {} when no plan
   * was chosen (the company is created without a plan).
   */
  async buildSignupAssignment(planId?: string, now: Date = new Date()): Promise<Partial<PlanAssignment>> {
    if (!planId) return {};
    const plan = await this.loadChoosablePlan(planId);
    return this.toAssignment(plan, true, now);
  }

  /**
   * Company admin (or Super Admin) moves a company to a plan. Blocks the
   * change when the company already has more app users than the new plan
   * allows.
   */
  async assignPlan(companyId: string, planId: string, actor: string): Promise<CompanySubscription> {
    const row = await this.repository.getCompanyPlanRow(companyId);
    if (!row) throw new NotFoundException('Company not found.');

    const plan = await this.loadChoosablePlan(planId);

    if (row.planId === plan.id && row.planStatus === 'ACTIVE') {
      throw new ConflictException('Your company is already on this plan.');
    }

    if (plan.maxUsers !== null) {
      const used = await this.repository.countAppUsers(companyId);
      if (used > plan.maxUsers) {
        throw new ConflictException(
          `Your company currently has ${used} app users, but the ${plan.name} plan allows ${plan.maxUsers}. ` +
            'Remove unused app users first, or choose a bigger plan.',
        );
      }
    }

    // The trial is only for a company's FIRST plan; every later change (including converting a trial) is active at once.
    const firstPlan = row.planId === null;
    await this.repository.setCompanyPlan(companyId, this.toAssignment(plan, firstPlan, new Date()));

    this.systemLogsService.record({
      user: actor,
      action: 'PLAN_CHANGED',
      resource: 'Plan',
      resourceId: plan.id,
      description: `Company ${companyId} moved to the ${plan.name} plan.`,
      metadata: { companyId, planId: plan.id, previousPlanId: row.planId },
    });

    return this.getSubscription(companyId);
  }

  // ---------- reading ----------

  async getSubscription(companyId: string): Promise<CompanySubscription> {
    const row = await this.repository.getCompanyPlanRow(companyId);
    if (!row) throw new NotFoundException('Company not found.');

    const plan = row.planId ? (await this.plansRepository.findById(row.planId)) ?? null : null;
    const used = await this.repository.countAppUsers(companyId);
    const now = Date.now();

    const onTrial = row.planStatus === 'TRIAL' && row.trialEndsAt !== null;
    const trialExpired = onTrial && (row.trialEndsAt as Date).getTime() <= now;
    const trialDaysLeft = onTrial ? Math.max(0, Math.ceil(((row.trialEndsAt as Date).getTime() - now) / DAY_MS)) : null;
    const maxUsers = plan ? plan.maxUsers : null;

    return {
      companyId,
      plan,
      status: row.planStatus ?? 'NONE',
      planStartedAt: row.planStartedAt ? row.planStartedAt.toISOString() : null,
      trialEndsAt: row.trialEndsAt ? row.trialEndsAt.toISOString() : null,
      trialExpired,
      trialDaysLeft,
      usage: { activeAppUsers: used, maxUsers, seatsLeft: maxUsers === null ? null : Math.max(0, maxUsers - used) },
      canUseMobileApp: !trialExpired,
    };
  }

  listAppUsers(companyId: string): Promise<MobileAppUser[]> {
    return this.repository.listAppUsers(companyId);
  }

  async removeAppUser(companyId: string, externalEmployeeId: string, actor: string): Promise<void> {
    const removed = await this.repository.removeAppUser(companyId, externalEmployeeId);
    if (!removed) throw new NotFoundException('That employee is not registered as an app user.');
    this.systemLogsService.record({
      user: actor,
      action: 'APP_USER_REMOVED',
      resource: 'Company',
      resourceId: companyId,
      description: `An app user was removed from company ${companyId}'s plan seats.`,
      metadata: { companyId },
    });
  }

  async actorName(userKey: string): Promise<string> {
    return (await this.repository.findUserName(userKey)) ?? userKey;
  }

  // ---------- mobile enforcement ----------

  /**
   * Throws 403 when the company's free trial has ended. Resolves (returning
   * the company's plan, or null for a legacy company) otherwise.
   */
  async assertMobileAccess(companyId: string): Promise<PricingPlan | null> {
    const row = await this.repository.getCompanyPlanRow(companyId);
    if (!row || !row.planId) return null;

    if (row.planStatus === 'TRIAL' && row.trialEndsAt && row.trialEndsAt.getTime() <= Date.now()) {
      throw new ForbiddenException('Your company\'s free trial has ended. Please ask your company admin to choose a plan.');
    }
    return (await this.plansRepository.findById(row.planId)) ?? null;
  }

  /**
   * Called on every successful mobile login: checks the trial, then takes
   * (or refreshes) this employee's seat under the plan's maxUsers. A
   * company already at its limit rejects only NEW employees; employees who
   * already hold a seat keep working.
   */
  async registerMobileUser(companyId: string, externalEmployeeId: string, name?: string): Promise<void> {
    const plan = await this.assertMobileAccess(companyId);
    const result = await this.repository.registerWithinLimit(companyId, externalEmployeeId, name?.trim() || null, plan ? plan.maxUsers : null);
    if (result === 'LIMIT_REACHED') {
      throw new ForbiddenException(
        `Your company has reached its plan limit of ${plan?.maxUsers} app users. Please ask your company admin to upgrade the plan.`,
      );
    }
  }
}
