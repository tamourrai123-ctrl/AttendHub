/**
 * One-off DDL — NOT part of the application, and NOT a Prisma migration.
 * Adds the minimal employee-identity columns Phase A.2 needs, per this
 * project's established "PostgreSQL is manually managed, Prisma only
 * introspects" convention (see scripts/add-real-authentication-columns.ts
 * and scripts/create-integration-field-mapping-table.ts for the same
 * pattern).
 *
 * Context (inspected before writing this — see the Phase A.2 report for
 * the full investigation):
 *   - usm_users is the ONLY place any employee data is persisted today.
 *     Attendance/Leave are still entirely in-memory/mock (no real tables
 *     exist for them at all), so there is nothing to change there.
 *   - The stated target architecture: the connected HR system is the
 *     source of truth for employee profile data, and AttendHub should be
 *     able to identify an employee using only (company_id, integration_id,
 *     external_employee_id) — WITHOUT duplicating HR profile fields or
 *     employee passwords.
 *   - Per explicit instruction, this phase does NOT implement HR sync or
 *     touch employee authentication, and usm_users' existing
 *     name/email/phone/mobile columns (and the Employee CRUD built on top
 *     of them) are staying exactly as they are for now — removing them now
 *     would break the only current way to see/manage an employee, with no
 *     sync in place yet to replace that data. This script only ADDS the
 *     new identity columns alongside the existing ones; see the Phase A.2
 *     report for the full reasoning.
 *   - integration_master's primary key is the composite (company_id, id)
 *     (see integration_detail's existing fk_id_id constraint for the exact
 *     same composite-FK pattern this script reuses).
 *
 * DESIGN:
 *   - usm_users.integration_id BIGINT NULL — which HR integration (if any)
 *     this employee is linked to. NULL for an employee with no HR link yet
 *     (e.g. one only ever created manually by a Company Admin).
 *   - usm_users.external_employee_id VARCHAR(100) NULL — the HR system's
 *     own id for this employee. Deliberately just an opaque string: no
 *     assumption is made about the external HR system's id format.
 *   - fk_usm_users_integration: composite FK (company_id, integration_id)
 *     -> integration_master(company_id, id). Postgres's default MATCH
 *     SIMPLE means a row with integration_id IS NULL never triggers this
 *     check (company_id alone being NOT NULL doesn't force the check —
 *     ALL referencing columns must be non-null for MATCH SIMPLE to
 *     enforce), so employees with no HR link are unaffected.
 *   - un_usm_users_company_integration_external_employee_id: a PARTIAL
 *     unique index on (company_id, integration_id, external_employee_id),
 *     only WHERE both are non-null. This is the actual multi-tenant-safety
 *     guarantee: the same external_employee_id can exist unlinked, or
 *     under a different integration, or under a different company, but
 *     never twice under the same (company, integration) pair. A plain
 *     Postgres UNIQUE CONSTRAINT cannot carry a WHERE clause, so this has
 *     to be a unique INDEX instead — Prisma's schema DSL can't fully
 *     represent a partial index either (see schema.prisma's comment above
 *     this table), but the real enforcement lives here, in Postgres,
 *     regardless of how it's spelled in schema.prisma.
 *
 * Every statement is guarded to be safely re-runnable: ADD COLUMN IF NOT
 * EXISTS, CREATE INDEX IF NOT EXISTS, and a DO block checking pg_constraint
 * before adding the FK (Postgres has no ADD CONSTRAINT IF NOT EXISTS).
 * Nothing here drops or alters existing data or existing columns.
 *
 * Run once with: npx ts-node scripts/add-employee-identity-columns.ts
 *
 * (Optional, separate, manual step afterwards: `npx prisma db pull` +
 * `npx prisma generate` + `npx prisma validate` — not run by this script.
 * schema.prisma has already been hand-updated to match what this script
 * creates, so `prisma validate`/`generate` will work even before running
 * `db pull`; `db pull` is only useful here to double-check the live
 * database matches what's now in schema.prisma.)
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

async function main(): Promise<void> {
  let app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>> | undefined;

  try {
    app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
    const prisma = app.get(PrismaService);

    console.log('Step 1/4: adding integration_id / external_employee_id columns to usm_users (if not already present)...');
    await prisma.$executeRawUnsafe(`
      ALTER TABLE usm_users
        ADD COLUMN IF NOT EXISTS integration_id BIGINT,
        ADD COLUMN IF NOT EXISTS external_employee_id VARCHAR(100);
    `);
    console.log('Done.');

    console.log('\nStep 2/4: adding the composite FK to integration_master (if not already present)...');
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'fk_usm_users_integration'
        ) THEN
          ALTER TABLE usm_users
            ADD CONSTRAINT fk_usm_users_integration
            FOREIGN KEY (company_id, integration_id)
            REFERENCES integration_master (company_id, id)
            ON DELETE NO ACTION ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);
    console.log('Done.');

    console.log('\nStep 3/4: adding the partial uniqueness index (company_id, integration_id, external_employee_id) (if not already present)...');
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS un_usm_users_company_integration_external_employee_id
        ON usm_users (company_id, integration_id, external_employee_id)
        WHERE integration_id IS NOT NULL AND external_employee_id IS NOT NULL;
    `);
    console.log('Done.');

    console.log('\nStep 4/4: creating a plain lookup index on external_employee_id (if not already present)...');
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_usm_users_external_employee_id ON usm_users (external_employee_id);
    `);
    console.log('Done.');

    console.log('\nVerifying...');
    const columns = await prisma.$queryRawUnsafe(`
      SELECT column_name, data_type, is_nullable, character_maximum_length
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'usm_users'
        AND column_name IN ('integration_id', 'external_employee_id')
      ORDER BY ordinal_position
    `);
    console.log(columns);
    const constraints = await prisma.$queryRawUnsafe(`
      SELECT conname FROM pg_constraint WHERE conname = 'fk_usm_users_integration'
    `);
    console.log(constraints);
    const indexes = await prisma.$queryRawUnsafe(`
      SELECT indexname, indexdef FROM pg_indexes
      WHERE tablename = 'usm_users'
        AND indexname IN ('un_usm_users_company_integration_external_employee_id', 'idx_usm_users_external_employee_id')
    `);
    console.log(indexes);

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
