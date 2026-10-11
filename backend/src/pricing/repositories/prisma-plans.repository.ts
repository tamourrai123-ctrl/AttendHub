import { Injectable } from '@nestjs/common';
import { Prisma, pricing_master as PricingMasterRow } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PricingPlan } from '../interfaces/pricing-plan.interface';
import { CreatePlanDto } from '../dto/create-plan.dto';
import { UpdatePlanDto } from '../dto/update-plan.dto';

/** Returns null (never throws) on a non-numeric id — callers treat that as "not found", matching PrismaSystemLogsRepository's toBigIntId() convention. */
function toBigIntId(id: string): bigint | null {
  try {
    return BigInt(id);
  } catch {
    return null;
  }
}

/**
 * pricing_master.short_name is a real, required (NOT NULL) column this
 * module has no use for — PricingPlan/CreatePlanDto never mention it. Rather
 * than add a seventh new column just to make it optional, this derives a
 * harmless filler value from the plan's name so the column stays satisfied
 * without ever being shown or read anywhere in the app.
 */
function shortNameFor(name: string): string {
  const slug = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return (slug || 'PLAN').slice(0, 50);
}

/**
 * PrismaPlansRepository — reads/writes the real `pricing_master` table.
 * Replaces InMemoryPlansRepository for this module only (see
 * pricing.module.ts); that file is left on disk, unused, the same way
 * InMemoryCompaniesRepository/InMemorySystemLogsRepository were left after
 * their own migrations.
 *
 * Column mapping and why six columns had to be added (see
 * scripts/add-pricing-plan-columns.ts for the actual DDL):
 *
 *   PricingPlan field -> pricing_master column
 *   -------------------------------------------
 *   id            -> id (BigInt, exposed as its decimal string — same
 *                     convention as PrismaSystemLogsRepository).
 *   name          -> name (direct mapping).
 *   description   -> description (added column; '' if somehow null).
 *   monthlyPrice  -> monthly_price (added column, NUMERIC(12,2)).
 *   yearlyPrice   -> yearly_price (added column, NUMERIC(12,2)).
 *   currency      -> currency (added column, e.g. "USD").
 *   features      -> features (added column, JSONB array of strings).
 *   recommended   -> recommended (added column, Char(1) Y/N — same
 *                     convention as every other flag column in this
 *                     database, e.g. usm_company.geo_fencing).
 *   displayOrder  -> sort_order (already existed).
 *   active        -> status (already existed, Char(1) Y/N — this table's
 *                     own pre-existing "active row" convention, same as
 *                     integration_master/integration_detail/usm_company).
 *   (none)        -> short_name (already existed, NOT NULL, unused by this
 *                     module — see shortNameFor() above).
 *
 * pricing_detail is intentionally never touched by this repository — see
 * this file's companion doc comment in schema.prisma for why (it's shaped
 * for line items/quotations, not a plan's feature list).
 */
@Injectable()
export class PrismaPlansRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<PricingPlan[]> {
    const rows = await this.prisma.pricing_master.findMany({ orderBy: { sort_order: 'asc' } });
    return rows.map((row) => this.toPlan(row));
  }

  async findActive(): Promise<PricingPlan[]> {
    const rows = await this.prisma.pricing_master.findMany({
      where: { status: 'Y' },
      orderBy: { sort_order: 'asc' },
    });
    return rows.map((row) => this.toPlan(row));
  }

  async findById(id: string): Promise<PricingPlan | undefined> {
    const numericId = toBigIntId(id);
    if (numericId === null) return undefined;

    const row = await this.prisma.pricing_master.findUnique({ where: { id: numericId } });
    return row ? this.toPlan(row) : undefined;
  }

  async count(): Promise<number> {
    return this.prisma.pricing_master.count();
  }

  async clearRecommended(): Promise<void> {
    await this.prisma.pricing_master.updateMany({ data: { recommended: 'N' } });
  }

  async create(dto: CreatePlanDto): Promise<PricingPlan> {
    const displayOrder = (await this.prisma.pricing_master.count()) + 1;
    const row = await this.prisma.pricing_master.create({
      data: {
        name: dto.name,
        short_name: shortNameFor(dto.name),
        description: dto.description,
        monthly_price: dto.monthlyPrice,
        yearly_price: dto.yearlyPrice,
        currency: dto.currency,
        features: dto.features,
        recommended: dto.recommended ? 'Y' : 'N',
        status: dto.active ? 'Y' : 'N',
        sort_order: displayOrder,
      },
    });
    return this.toPlan(row);
  }

  async update(id: string, dto: UpdatePlanDto): Promise<PricingPlan | undefined> {
    const numericId = toBigIntId(id);
    if (numericId === null) return undefined;

    const data: Prisma.pricing_masterUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.monthlyPrice !== undefined) data.monthly_price = dto.monthlyPrice;
    if (dto.yearlyPrice !== undefined) data.yearly_price = dto.yearlyPrice;
    if (dto.currency !== undefined) data.currency = dto.currency;
    if (dto.features !== undefined) data.features = dto.features;
    if (dto.recommended !== undefined) data.recommended = dto.recommended ? 'Y' : 'N';
    if (dto.active !== undefined) data.status = dto.active ? 'Y' : 'N';
    if (dto.displayOrder !== undefined) data.sort_order = dto.displayOrder;

    try {
      const row = await this.prisma.pricing_master.update({ where: { id: numericId }, data });
      return this.toPlan(row);
    } catch {
      // Prisma throws (P2025) when the row doesn't exist — callers treat
      // that the same as "not found", matching the in-memory repo's
      // undefined-return behavior.
      return undefined;
    }
  }

  async remove(id: string): Promise<boolean> {
    const numericId = toBigIntId(id);
    if (numericId === null) return false;

    try {
      await this.prisma.pricing_master.delete({ where: { id: numericId } });
      return true;
    } catch {
      return false;
    }
  }

  private toPlan(row: PricingMasterRow): PricingPlan {
    return {
      id: row.id.toString(),
      name: row.name,
      description: row.description ?? '',
      monthlyPrice: Number(row.monthly_price),
      yearlyPrice: Number(row.yearly_price),
      currency: row.currency,
      features: Array.isArray(row.features) ? (row.features as string[]) : [],
      recommended: row.recommended === 'Y',
      displayOrder: row.sort_order,
      active: row.status === 'Y',
    };
  }
}
