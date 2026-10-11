/**
 * One-off DDL — NOT part of the application, and NOT a Prisma migration.
 * Adds the columns the Pricing module's Postgres migration needs, per this
 * project's established "PostgreSQL is manually managed, Prisma only
 * introspects" convention (see scripts/add-employee-identity-columns.ts for
 * the same pattern).
 *
 * Context (inspected before writing this):
 *   - pricing_master/pricing_detail already exist in the database and were
 *     already in schema.prisma, but PricingService still ran entirely on
 *     InMemoryPlansRepository — nothing had ever written to these tables.
 *   - The existing shape (pricing_master: name/short_name/sort_order/status;
 *     pricing_detail: pid/description/unit_of_measurement/quantity/price/
 *     amount) reads as a generic quotation/line-item schema, not a SaaS
 *     subscription plan. It has nowhere to put a monthly price, a yearly
 *     price, a currency, a single "recommended" flag, or a list of feature
 *     bullet strings — and pricing_detail's quantity/price/amount/
 *     unit_of_measurement columns don't naturally mean any of those things
 *     either. Rather than force that mismatch, this script adds the six
 *     missing columns directly to pricing_master and leaves pricing_detail
 *     completely unused by this module (see PrismaPlansRepository's own doc
 *     comment for the full reasoning).
 *
 * DESIGN:
 *   - description        VARCHAR(500) NULL       — the plan's own description text.
 *   - monthly_price       NUMERIC(12,2) NOT NULL DEFAULT 0
 *   - yearly_price        NUMERIC(12,2) NOT NULL DEFAULT 0
 *   - currency            VARCHAR(10)  NOT NULL DEFAULT 'USD'
 *   - recommended         CHAR(1)      NOT NULL DEFAULT 'N'  — Y/N, same
 *                          convention as every other flag column in this
 *                          database (see usm_company.geo_fencing etc.).
 *   - features            JSONB        NOT NULL DEFAULT '[]' — a plain JSON
 *                          array of feature strings, e.g.
 *                          ["Up to 25 employees", "1 HR integration"].
 *
 * Every statement is guarded to be safely re-runnable: ADD COLUMN IF NOT
 * EXISTS. Nothing here drops or alters existing data or existing columns —
 * pricing_master's existing rows (if any) simply get the DEFAULT values
 * above for the new columns.
 *
 * Run once with: npx ts-node scripts/add-pricing-plan-columns.ts
 *
 * (Optional, separate, manual step afterwards: `npx prisma db pull` +
 * `npx prisma generate` + `npx prisma validate` — not run by this script.
 * schema.prisma has already been hand-updated to match what this script
 * creates, so `prisma validate`/`generate` will work even before running
 * `db pull`.)
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

async function main(): Promise<void> {
  let app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>> | undefined;

  try {
    app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
    const prisma = app.get(PrismaService);

    console.log('Step 1/2: adding pricing_master columns (if not already present)...');
    await prisma.$executeRawUnsafe(`
      ALTER TABLE pricing_master
        ADD COLUMN IF NOT EXISTS description VARCHAR(500),
        ADD COLUMN IF NOT EXISTS monthly_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS yearly_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS currency VARCHAR(10) NOT NULL DEFAULT 'USD',
        ADD COLUMN IF NOT EXISTS recommended CHAR(1) NOT NULL DEFAULT 'N',
        ADD COLUMN IF NOT EXISTS features JSONB NOT NULL DEFAULT '[]'::jsonb;
    `);
    console.log('Done.');

    console.log('\nVerifying...');
    const columns = await prisma.$queryRawUnsafe(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'pricing_master'
        AND column_name IN ('description', 'monthly_price', 'yearly_price', 'currency', 'recommended', 'features')
      ORDER BY ordinal_position
    `);
    console.log(columns);

    console.log('\nAll done. No existing column, row, or constraint was changed or removed.');
  } catch (error) {
    console.error('Schema change failed:');
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (app) {
      await app.close();
    }
  }
}

main();
