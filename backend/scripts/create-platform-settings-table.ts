/**
 * One-off DDL — NOT part of the application, and NOT a Prisma migration.
 * Manually creates the `platform_settings` table, per this project's
 * established "PostgreSQL is manually managed, Prisma only introspects"
 * convention (see scripts/create-integration-field-mapping-table.ts for the
 * same "create a brand new table" pattern).
 *
 * Context: SettingsService (Super Admin's Settings page — session timeout,
 * "require two-step login", and the three notification toggles) has run
 * entirely on InMemorySettingsRepository until now — a single process-wide
 * value that resets to DEFAULT_PLATFORM_SETTINGS on every server restart.
 * There was no existing table anywhere in this database shaped for this
 * (unlike Pricing/Monitoring, which had pricing_master/api_logs sitting
 * unused) — these are platform-wide settings with no per-company meaning,
 * so nothing in usm_company fits either. Hence a genuinely new table, the
 * same way integration_field_mapping was created from scratch in an earlier
 * phase.
 *
 * DESIGN — a deliberate SINGLETON table (there is exactly one platform, so
 * exactly one settings row, always at id=1):
 *   - id                      SMALLINT, always 1 — CHECK (id = 1) alongside
 *                             the primary key makes a second row impossible
 *                             at the database level, not just by convention.
 *   - session_timeout_minutes INT NOT NULL DEFAULT 1440 (24h, matching the
 *                             previous hardcoded SESSION_TTL_SECONDS so this
 *                             migration doesn't silently change existing
 *                             session lifetimes) — CHECK keeps it within the
 *                             same 5..10080 range UpdateSettingsDto already
 *                             validates.
 *   - require_two_step_login,
 *     system_error_alerts,
 *     api_failure_alerts,
 *     integration_warnings   CHAR(1) Y/N — same flag convention as every
 *                             other boolean-ish column in this database
 *                             (e.g. usm_company.geo_fencing). The three
 *                             alert toggles default to 'Y' to match today's
 *                             behavior (every one of these already fires,
 *                             just without a stored toggle backing it).
 *   - edit_by / edit_date     Nullable audit columns, same shape as every
 *                             other *_by/*_date pair in this database.
 *                             SettingsService.update() doesn't currently
 *                             receive an actor name (no @CurrentUser() on
 *                             the PATCH route — seSettingsController), so
 *                             edit_by is left null for now; edit_date is set
 *                             on every save.
 *
 * The single row is seeded here so it always exists once this script has
 * run; PrismaSettingsRepository.find() also upserts defensively (in case
 * this row is ever deleted by hand), so the app never sees a missing row.
 *
 * Every statement is guarded to be safely re-runnable: CREATE TABLE IF NOT
 * EXISTS, and an INSERT ... ON CONFLICT DO NOTHING for the seed row. Nothing
 * here drops or alters any existing table.
 *
 * Run once with: npx ts-node scripts/create-platform-settings-table.ts
 *
 * (Optional, separate, manual step afterwards: `npx prisma db pull` +
 * `npx prisma generate` + `npx prisma validate` — not run by this script.
 * schema.prisma has already been hand-updated to match what this script
 * creates, so `prisma validate`/`generate` will work even before running
 * `db pull`. Run `npx prisma generate` BEFORE this script if you haven't
 * already, so ts-node's full-project type-check has the new columns to
 * compile against — the generate step is purely local codegen from
 * schema.prisma and never touches the database.)
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

async function main(): Promise<void> {
  let app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>> | undefined;

  try {
    app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
    const prisma = app.get(PrismaService);

    console.log('Step 1/2: creating platform_settings (if it does not already exist)...');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS platform_settings (
        id SMALLINT NOT NULL DEFAULT 1,
        session_timeout_minutes INT NOT NULL DEFAULT 1440,
        require_two_step_login CHAR(1) NOT NULL DEFAULT 'N',
        system_error_alerts CHAR(1) NOT NULL DEFAULT 'Y',
        api_failure_alerts CHAR(1) NOT NULL DEFAULT 'Y',
        integration_warnings CHAR(1) NOT NULL DEFAULT 'Y',
        edit_by VARCHAR(50),
        edit_date TIMESTAMP(6),
        CONSTRAINT pk_platform_settings PRIMARY KEY (id),
        CONSTRAINT chk_platform_settings_singleton CHECK (id = 1),
        CONSTRAINT chk_platform_settings_session_timeout CHECK (session_timeout_minutes BETWEEN 5 AND 10080),
        CONSTRAINT chk_platform_settings_two_step CHECK (require_two_step_login IN ('Y', 'N')),
        CONSTRAINT chk_platform_settings_system_error_alerts CHECK (system_error_alerts IN ('Y', 'N')),
        CONSTRAINT chk_platform_settings_api_failure_alerts CHECK (api_failure_alerts IN ('Y', 'N')),
        CONSTRAINT chk_platform_settings_integration_warnings CHECK (integration_warnings IN ('Y', 'N'))
      );
    `);
    console.log('Done.');

    console.log('\nStep 2/2: seeding the single settings row (id=1) if it does not already exist...');
    await prisma.$executeRawUnsafe(`
      INSERT INTO platform_settings (id) VALUES (1)
      ON CONFLICT (id) DO NOTHING;
    `);
    console.log('Done.');

    console.log('\nVerifying...');
    const columns = await prisma.$queryRawUnsafe(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'platform_settings'
      ORDER BY ordinal_position
    `);
    console.log(columns);
    const row = await prisma.$queryRawUnsafe(`SELECT * FROM platform_settings WHERE id = 1`);
    console.log(row);

    console.log('\nAll done.');
  } catch (error) {
    console.error('Schema creation failed:');
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (app) {
      await app.close();
    }
  }
}

main();
