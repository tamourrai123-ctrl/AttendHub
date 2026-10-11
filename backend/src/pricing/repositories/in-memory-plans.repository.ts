import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PricingPlan } from '../interfaces/pricing-plan.interface';
import { CreatePlanDto } from '../dto/create-plan.dto';
import { UpdatePlanDto } from '../dto/update-plan.dto';

/**
 * InMemoryPlansRepository — temporary development storage. Seed data
 * matches src/mock/pricing.ts. The "max 5 plans" and "only one recommended"
 * rules are enforced by PricingService, not here — this class only stores
 * and retrieves.
 */
@Injectable()
export class InMemoryPlansRepository {
  private plans: PricingPlan[] = [
    { id: 'plan_starter', name: 'Starter', description: 'For small teams just getting started with attendance tracking.', monthlyPrice: 9, yearlyPrice: 90, currency: 'USD', features: ['Up to 25 employees', '1 HR integration', 'Attendance history', 'Email support'], recommended: false, displayOrder: 1, active: true },
    { id: 'plan_professional', name: 'Professional', description: 'For growing companies that need deeper visibility and monitoring.', monthlyPrice: 29, yearlyPrice: 290, currency: 'USD', features: ['Up to 250 employees', 'Unlimited HR integrations', 'API monitoring & system logs', 'Attendance history & reports', 'Priority support'], recommended: true, displayOrder: 2, active: true },
    { id: 'plan_enterprise', name: 'Enterprise', description: 'For large organizations with advanced compliance and support needs.', monthlyPrice: 79, yearlyPrice: 790, currency: 'USD', features: ['Unlimited employees', 'Unlimited HR integrations', 'Dedicated account manager', 'Custom reporting', '24/7 priority support'], recommended: false, displayOrder: 3, active: true },
  ];

  findAll(): PricingPlan[] {
    return this.plans;
  }

  findActive(): PricingPlan[] {
    return this.plans.filter((plan) => plan.active).sort((a, b) => a.displayOrder - b.displayOrder);
  }

  findById(id: string): PricingPlan | undefined {
    return this.plans.find((plan) => plan.id === id);
  }

  count(): number {
    return this.plans.length;
  }

  clearRecommended(): void {
    this.plans.forEach((plan) => (plan.recommended = false));
  }

  create(dto: CreatePlanDto): PricingPlan {
    const plan: PricingPlan = {
      id: `plan_${randomUUID().slice(0, 8)}`,
      name: dto.name,
      description: dto.description,
      monthlyPrice: dto.monthlyPrice,
      yearlyPrice: dto.yearlyPrice,
      currency: dto.currency,
      features: dto.features,
      recommended: dto.recommended,
      displayOrder: this.plans.length + 1,
      active: dto.active,
    };
    this.plans.push(plan);
    return plan;
  }

  update(id: string, dto: UpdatePlanDto): PricingPlan | undefined {
    const plan = this.findById(id);
    if (!plan) return undefined;
    Object.assign(plan, dto);
    return plan;
  }

  remove(id: string): boolean {
    const lengthBefore = this.plans.length;
    this.plans = this.plans.filter((plan) => plan.id !== id);
    return this.plans.length < lengthBefore;
  }
}
