import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CompanyPlanRow, MobileAppUser, PlanAssignment, PlanStatus, RegisterSeatResult } from '../interfaces/subscription.interface';

/** Parses a decimal id; null (never throws) when it isn't one. */
function toBigInt(value: string): bigint | null {
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

/**
 * Reads/writes the subscription columns on usm_company and the
 * mobile_app_users seat table (see scripts/add-subscription-columns.sql).
 * Plan definitions themselves live in pricing_master and are read through
 * PrismaPlansRepository.
 */
@Injectable()
export class PrismaSubscriptionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getCompanyPlanRow(companyId: string): Promise<CompanyPlanRow | undefined> {
    const row = await this.prisma.usm_company.findUnique({
      where: { id: companyId },
      select: { plan_id: true, plan_status: true, plan_started_at: true, trial_ends_at: true },
    });
    if (!row) return undefined;
    return {
      planId: row.plan_id === null || row.plan_id === undefined ? null : row.plan_id.toString(),
      planStatus: row.plan_status === 'TRIAL' || row.plan_status === 'ACTIVE' ? (row.plan_status as PlanStatus) : null,
      planStartedAt: row.plan_started_at ?? null,
      trialEndsAt: row.trial_ends_at ?? null,
    };
  }

  async setCompanyPlan(companyId: string, assignment: PlanAssignment): Promise<void> {
    await this.prisma.usm_company.update({
      where: { id: companyId },
      data: {
        plan_id: assignment.plan_id,
        plan_status: assignment.plan_status,
        plan_started_at: assignment.plan_started_at,
        trial_ends_at: assignment.trial_ends_at,
      },
    });
  }

  /** Display name for audit logs: the usm_users row behind a "{company_id}:{user_id}" session key, or undefined. */
  async findUserName(userKey: string): Promise<string | undefined> {
    const [companyId, rawUserId] = userKey.split(':');
    const userId = rawUserId ? toBigInt(rawUserId) : null;
    if (!companyId || userId === null) return undefined;
    const row = await this.prisma.usm_users.findUnique({
      where: { company_id_user_id: { company_id: companyId, user_id: userId } },
      select: { user_name: true },
    });
    return row?.user_name;
  }

  async countAppUsers(companyId: string): Promise<number> {
    return this.prisma.mobile_app_users.count({ where: { company_id: companyId } });
  }

  async listAppUsers(companyId: string): Promise<MobileAppUser[]> {
    const rows = await this.prisma.mobile_app_users.findMany({
      where: { company_id: companyId },
      orderBy: { last_seen_at: 'desc' },
    });
    return rows.map((row) => ({
      externalEmployeeId: row.external_employee_id,
      name: row.employee_name ?? null,
      firstSeenAt: row.first_seen_at.toISOString(),
      lastSeenAt: row.last_seen_at.toISOString(),
    }));
  }

  /** Frees one seat. Returns false when that employee wasn't registered. */
  async removeAppUser(companyId: string, externalEmployeeId: string): Promise<boolean> {
    const result = await this.prisma.mobile_app_users.deleteMany({
      where: { company_id: companyId, external_employee_id: externalEmployeeId },
    });
    return result.count > 0;
  }

  /**
   * Registers (or refreshes) one employee's seat under the plan limit.
   * The company row is locked (SELECT ... FOR UPDATE) for the duration, so
   * two employees logging in at the same moment can never both take the
   * last seat.
   */
  async registerWithinLimit(
    companyId: string,
    externalEmployeeId: string,
    name: string | null,
    maxUsers: number | null,
  ): Promise<RegisterSeatResult> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM usm_company WHERE id = ${companyId} FOR UPDATE`;

      const existing = await tx.mobile_app_users.findUnique({
        where: { company_id_external_employee_id: { company_id: companyId, external_employee_id: externalEmployeeId } },
      });
      const now = new Date();
      if (existing) {
        await tx.mobile_app_users.update({
          where: { company_id_external_employee_id: { company_id: companyId, external_employee_id: externalEmployeeId } },
          data: { last_seen_at: now, ...(name ? { employee_name: name.slice(0, 100) } : {}) },
        });
        return 'EXISTING' as const;
      }

      if (maxUsers !== null) {
        const used = await tx.mobile_app_users.count({ where: { company_id: companyId } });
        if (used >= maxUsers) return 'LIMIT_REACHED' as const;
      }

      await tx.mobile_app_users.create({
        data: {
          company_id: companyId,
          external_employee_id: externalEmployeeId,
          employee_name: name ? name.slice(0, 100) : null,
          first_seen_at: now,
          last_seen_at: now,
        },
      });
      return 'ADDED' as const;
    });
  }
}
