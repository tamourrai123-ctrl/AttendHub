import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { SystemLogsService } from '../system-logs/system-logs.service';
import { PrismaPlansRepository } from './repositories/prisma-plans.repository';
import { MAX_PRICING_PLANS, PricingPlan } from './interfaces/pricing-plan.interface';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';

/**
 * Pricing service — Super Admin manages plans, anyone (including
 * unauthenticated visitors) can read the active list. No Stripe, no
 * payment processing, no billing anywhere here — see Phase 4B section 19.
 *
 * As of the Pricing Postgres migration, this runs on PrismaPlansRepository
 * (the real `pricing_master` table) instead of InMemoryPlansRepository —
 * see that repository's own doc comment for the column mapping and why six
 * new columns had to be added. Every method here is now async since the
 * repository does real database I/O.
 */
@Injectable()
export class PricingService {
  constructor(
    private readonly repository: PrismaPlansRepository,
    private readonly systemLogsService: SystemLogsService,
  ) {}

  /** GET /api/plans (public) — active plans only, sorted for display. */
  async findActive(): Promise<PricingPlan[]> {
    return this.repository.findActive();
  }

  /** GET /api/plans/all (Super Admin) — every plan, including inactive ones. */
  async findAll(): Promise<PricingPlan[]> {
    return this.repository.findAll();
  }

  async findOne(id: string): Promise<PricingPlan> {
    const plan = await this.repository.findById(id);
    if (!plan) {
      throw new NotFoundException('Pricing plan not found.');
    }
    return plan;
  }

  async create(dto: CreatePlanDto, actorName: string): Promise<PricingPlan> {
    if ((await this.repository.count()) >= MAX_PRICING_PLANS) {
      throw new ConflictException(`A maximum of ${MAX_PRICING_PLANS} pricing plans is allowed.`);
    }

    if (dto.recommended) {
      await this.repository.clearRecommended();
    }

    const plan = await this.repository.create(dto);

    this.systemLogsService.record({
      user: actorName,
      action: 'PLAN_CREATED',
      resource: 'Plan',
      resourceId: plan.id,
      description: `Created pricing plan ${plan.name}.`,
      metadata: { planId: plan.id },
    });

    return plan;
  }

  async update(id: string, dto: UpdatePlanDto, actorName: string): Promise<PricingPlan> {
    if (dto.recommended) {
      await this.repository.clearRecommended();
    }

    const updated = await this.repository.update(id, dto);
    if (!updated) {
      throw new NotFoundException('Pricing plan not found.');
    }

    this.systemLogsService.record({
      user: actorName,
      action: 'PLAN_UPDATED',
      resource: 'Plan',
      resourceId: updated.id,
      description: `Updated pricing plan ${updated.name}.`,
      metadata: { planId: updated.id, changes: dto },
    });

    return updated;
  }

  async remove(id: string, actorName: string): Promise<void> {
    const plan = await this.repository.findById(id);
    if (!plan) {
      throw new NotFoundException('Pricing plan not found.');
    }

    await this.repository.remove(id);

    this.systemLogsService.record({
      user: actorName,
      action: 'PLAN_DELETED',
      resource: 'Plan',
      resourceId: id,
      severity: 'WARNING',
      description: `Deleted pricing plan ${plan.name}.`,
      metadata: { planId: id },
    });
  }
}
