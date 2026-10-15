import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PricingPlan } from '../pricing/interfaces/pricing-plan.interface';
import { SubscriptionsService } from './subscriptions.service';
import { CompanyPlanRow } from './interfaces/subscription.interface';

const DAY = 24 * 60 * 60 * 1000;

function plan(overrides: Partial<PricingPlan> = {}): PricingPlan {
  return {
    id: '2',
    name: 'Basic',
    description: '',
    monthlyPrice: 10,
    yearlyPrice: 100,
    currency: 'USD',
    features: [],
    recommended: false,
    displayOrder: 1,
    active: true,
    maxUsers: 5,
    trialDays: 0,
    customFeatures: [],
    ...overrides,
  };
}

const NO_PLAN: CompanyPlanRow = { planId: null, planStatus: null, planStartedAt: null, trialEndsAt: null };

function build(opts: { row?: CompanyPlanRow | undefined; plans?: PricingPlan[]; used?: number; seat?: 'EXISTING' | 'ADDED' | 'LIMIT_REACHED' } = {}) {
  const row = 'row' in opts ? opts.row : NO_PLAN;
  const plans = opts.plans ?? [plan()];
  const repository = {
    getCompanyPlanRow: jest.fn(async () => row),
    setCompanyPlan: jest.fn(async () => undefined),
    countAppUsers: jest.fn(async () => opts.used ?? 0),
    registerWithinLimit: jest.fn(async () => opts.seat ?? 'ADDED'),
    listAppUsers: jest.fn(async () => []),
    removeAppUser: jest.fn(async () => true),
    findUserName: jest.fn(async () => undefined),
  };
  const plansRepository = { findById: jest.fn(async (id: string) => plans.find((p) => p.id === id)) };
  const systemLogs = { record: jest.fn() };
  const service = new SubscriptionsService(repository as never, plansRepository as never, systemLogs as never);
  return { service, repository, plansRepository, systemLogs };
}

describe('SubscriptionsService.buildSignupAssignment', () => {
  it('returns nothing when no plan was chosen', async () => {
    expect(await build().service.buildSignupAssignment(undefined)).toEqual({});
  });

  it("starts a TRIAL ending trialDays from now when the plan has a trial", async () => {
    const now = new Date('2026-10-14T00:00:00Z');
    const { service } = build({ plans: [plan({ trialDays: 14 })] });
    const result = await service.buildSignupAssignment('2', now);
    expect(result.plan_status).toBe('TRIAL');
    expect(result.plan_id).toBe(BigInt(2));
    expect((result.trial_ends_at as Date).getTime()).toBe(now.getTime() + 14 * DAY);
  });

  it('is ACTIVE straight away (no trial date) when the plan has no trial', async () => {
    const result = await build().service.buildSignupAssignment('2');
    expect(result.plan_status).toBe('ACTIVE');
    expect(result.trial_ends_at).toBeNull();
  });

  it('rejects an inactive plan and an unknown plan', async () => {
    await expect(build({ plans: [plan({ active: false })] }).service.buildSignupAssignment('2')).rejects.toBeInstanceOf(BadRequestException);
    await expect(build().service.buildSignupAssignment('99')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('SubscriptionsService.assignPlan', () => {
  it("gives a company's FIRST plan its trial", async () => {
    const { service, repository } = build({ plans: [plan({ trialDays: 7 })] });
    await service.assignPlan('cA', '2', 'Admin');
    const assignment = (repository.setCompanyPlan.mock.calls[0] as unknown[])[1] as { plan_status: string; trial_ends_at: Date | null };
    expect(assignment.plan_status).toBe('TRIAL');
    expect(assignment.trial_ends_at).not.toBeNull();
  });

  it('makes a LATER plan change active immediately, with no new trial', async () => {
    const row: CompanyPlanRow = { planId: '1', planStatus: 'ACTIVE', planStartedAt: new Date(), trialEndsAt: null };
    const { service, repository } = build({ row, plans: [plan({ id: '2', trialDays: 30 })] });
    await service.assignPlan('cA', '2', 'Admin');
    const assignment = (repository.setCompanyPlan.mock.calls[0] as unknown[])[1] as { plan_status: string; trial_ends_at: Date | null };
    expect(assignment.plan_status).toBe('ACTIVE');
    expect(assignment.trial_ends_at).toBeNull();
  });

  it('lets a company on a trial convert to the same plan, but refuses picking the plan it already has ACTIVE', async () => {
    const trialRow: CompanyPlanRow = { planId: '2', planStatus: 'TRIAL', planStartedAt: new Date(), trialEndsAt: new Date(Date.now() + DAY) };
    await build({ row: trialRow }).service.assignPlan('cA', '2', 'Admin');

    const activeRow: CompanyPlanRow = { planId: '2', planStatus: 'ACTIVE', planStartedAt: new Date(), trialEndsAt: null };
    await expect(build({ row: activeRow }).service.assignPlan('cA', '2', 'Admin')).rejects.toBeInstanceOf(ConflictException);
  });

  it('blocks a downgrade while the company has more app users than the new plan allows', async () => {
    const row: CompanyPlanRow = { planId: '1', planStatus: 'ACTIVE', planStartedAt: new Date(), trialEndsAt: null };
    const { service, repository } = build({ row, used: 8, plans: [plan({ id: '2', maxUsers: 5 })] });
    await expect(service.assignPlan('cA', '2', 'Admin')).rejects.toBeInstanceOf(ConflictException);
    expect(repository.setCompanyPlan).not.toHaveBeenCalled();
  });

  it('allows any user count on an unlimited plan', async () => {
    const { service, repository } = build({ used: 500, plans: [plan({ maxUsers: null })] });
    await service.assignPlan('cA', '2', 'Admin');
    expect(repository.setCompanyPlan).toHaveBeenCalledTimes(1);
  });

  it('404s for an unknown company', async () => {
    await expect(build({ row: undefined }).service.assignPlan('zz', '2', 'Admin')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('SubscriptionsService.getSubscription', () => {
  it('reports trial days left and the seat usage', async () => {
    const row: CompanyPlanRow = { planId: '2', planStatus: 'TRIAL', planStartedAt: new Date(), trialEndsAt: new Date(Date.now() + 3 * DAY - 1000) };
    const result = await build({ row, used: 2, plans: [plan({ maxUsers: 5 })] }).service.getSubscription('cA');
    expect(result.status).toBe('TRIAL');
    expect(result.trialDaysLeft).toBe(3);
    expect(result.trialExpired).toBe(false);
    expect(result.canUseMobileApp).toBe(true);
    expect(result.usage).toEqual({ activeAppUsers: 2, maxUsers: 5, seatsLeft: 3 });
  });

  it('marks an ended trial as expired and blocks the mobile app', async () => {
    const row: CompanyPlanRow = { planId: '2', planStatus: 'TRIAL', planStartedAt: new Date(), trialEndsAt: new Date(Date.now() - 1000) };
    const result = await build({ row }).service.getSubscription('cA');
    expect(result.trialExpired).toBe(true);
    expect(result.trialDaysLeft).toBe(0);
    expect(result.canUseMobileApp).toBe(false);
  });

  it('treats a company without a plan as unlimited and never blocked', async () => {
    const result = await build({ used: 40 }).service.getSubscription('cA');
    expect(result.status).toBe('NONE');
    expect(result.plan).toBeNull();
    expect(result.usage).toEqual({ activeAppUsers: 40, maxUsers: null, seatsLeft: null });
    expect(result.canUseMobileApp).toBe(true);
  });
});

describe('SubscriptionsService mobile enforcement', () => {
  it('lets a company with no plan straight through', async () => {
    expect(await build().service.assertMobileAccess('cA')).toBeNull();
  });

  it('refuses the mobile app once the free trial has ended', async () => {
    const row: CompanyPlanRow = { planId: '2', planStatus: 'TRIAL', planStartedAt: new Date(), trialEndsAt: new Date(Date.now() - 1000) };
    await expect(build({ row }).service.assertMobileAccess('cA')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("takes a seat under the plan's maxUsers", async () => {
    const row: CompanyPlanRow = { planId: '2', planStatus: 'ACTIVE', planStartedAt: new Date(), trialEndsAt: null };
    const { service, repository } = build({ row, plans: [plan({ maxUsers: 5 })] });
    await service.registerMobileUser('cA', '000008', ' Ali ');
    expect(repository.registerWithinLimit).toHaveBeenCalledWith('cA', '000008', 'Ali', 5);
  });

  it('passes null (unlimited) for a company without a plan', async () => {
    const { service, repository } = build();
    await service.registerMobileUser('cA', '000008');
    expect(repository.registerWithinLimit).toHaveBeenCalledWith('cA', '000008', null, null);
  });

  it('rejects a NEW employee when the plan has no seat left, but not one who already has a seat', async () => {
    const row: CompanyPlanRow = { planId: '2', planStatus: 'ACTIVE', planStartedAt: new Date(), trialEndsAt: null };
    await expect(build({ row, seat: 'LIMIT_REACHED' }).service.registerMobileUser('cA', '000009')).rejects.toBeInstanceOf(ForbiddenException);
    await build({ row, seat: 'EXISTING' }).service.registerMobileUser('cA', '000008');
  });
});

describe('SubscriptionsService app-user seats', () => {
  it('404s when removing an employee who holds no seat', async () => {
    const { service, repository } = build();
    repository.removeAppUser.mockResolvedValueOnce(false);
    await expect(service.removeAppUser('cA', 'nobody', 'Admin')).rejects.toBeInstanceOf(NotFoundException);
  });
});
