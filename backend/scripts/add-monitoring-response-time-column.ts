/**
 * One-off DDL — NOT part of the application, and NOT a Prisma migration.
 * Adds the one column the Monitoring module's Postgres migration needs, per
 * this project's established "PostgreSQL is manually managed, Prisma only
 * introspects" convention (see scripts/add-employee-identity-columns.ts for
 * the same pattern).
 *
 * Context: api_logs already exists in the database and was already in
 * schema.prisma, but MonitoringService still ran entirely on
 * InMemoryMonitoringRepository — nothing had ever written to this table.
 * Every field MonitoringInterceptor already captures (method/endpoint/
 * statusCode/userId/companyId) has a matching real column
 * (request_method/request_path/response_status/user_id/company_id) except
 * one: how long the request took. Without it, the "average response time"
 * summary stat (GET /api/monitoring/summary) would have nothing to average.
 *
 * DESIGN:
 *   - response_time_ms   INT NULL — milliseconds. Nullable since rows
 *                        written before this column existed (if any) have
 *                        nothing to backfill it with.
 *
 * Run once with: npx ts-node scripts/add-monitoring-response-time-column.ts
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

    console.log('Step 1/1: adding api_logs.response_time_ms (if not already present)...');
    await prisma.$executeRawUnsafe(`
      ALTER TABLE api_logs
        ADD COLUMN IF NOT EXISTS response_time_ms INT;
    `);
    console.log('Done.');

    console.log('\nVerifying...');
    const columns = await prisma.$queryRawUnsafe(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'api_logs'
        AND column_name = 'response_time_ms'
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
