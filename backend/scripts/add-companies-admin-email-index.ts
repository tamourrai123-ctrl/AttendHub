/**
 * One-off DDL — NOT part of the application, and NOT a Prisma migration.
 *
 * Adds exactly one index, identified by the Prisma repository audit report
 * (section F) as justified by an actual query pattern:
 *
 *   PrismaCompaniesRepository.findByEmail() — used by CompaniesService's
 *   duplicate-email check on company creation — runs:
 *
 *     usm_users.findFirst({
 *       where: { is_admin: 'Y', email_address: { equals, mode: 'insensitive' } }
 *     })
 *
 *   with NO company_id in the WHERE clause at all (deliberately: it's
 *   looking for which company a given admin email belongs to, before a
 *   companyId is known). As usm_users grows across many companies, this is
 *   effectively a platform-wide scan for every single company-creation
 *   request. schema.prisma has no index over (is_admin, email_address)
 *   today — confirmed by reading prisma/schema.prisma directly rather than
 *   assuming.
 *
 * Index shape, and why:
 *   - Expression index on lower(email_address): the query compares case-
 *     insensitively (`mode: 'insensitive'`), which a plain B-tree index on
 *     email_address itself cannot serve — Postgres needs the expression
 *     indexed, not the raw column.
 *   - Partial index (WHERE is_admin = 'Y'): the query always filters
 *     is_admin = 'Y' too. is_admin is low-cardinality (mostly 'N'), so a
 *     partial index keeps the index small (only admin rows) instead of
 *     indexing every usm_users row for a predicate the query never uses
 *     without that filter.
 *   - No company_id in the index: the query itself has no company_id
 *     predicate, so including one would not be used by this query.
 *
 * This does NOT use `prisma migrate dev` and does NOT modify
 * prisma/schema.prisma — PostgreSQL remains manually managed, per the
 * project's existing convention (see package.json's prisma:pull, and this
 * same scripts/ folder's other one-off diagnostics). CREATE INDEX
 * CONCURRENTLY avoids locking usm_users against writes while it builds;
 * IF NOT EXISTS makes this safe to run more than once.
 *
 * Run once with: npx ts-node scripts/add-companies-admin-email-index.ts
 *
 * (Optional, separate, manual step: `npm run prisma:pull` afterwards will
 * make schema.prisma's introspected model reflect this index too. That's
 * pure documentation for Prisma — the index itself works in Postgres
 * regardless of whether schema.prisma has been re-pulled.)
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const INDEX_NAME = 'idx_usm_users_admin_email_lower';

async function main(): Promise<void> {
  let app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>> | undefined;

  try {
    app = await NestFactory.createApplicationContext(AppModule, {
      logger: ['error', 'warn'],
    });
    const prisma = app.get(PrismaService);

    console.log(`Creating index ${INDEX_NAME} on usm_users (if it does not already exist)...`);
    await prisma.$executeRawUnsafe(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS ${INDEX_NAME} ` +
        `ON usm_users (lower(email_address)) ` +
        `WHERE is_admin = 'Y'`,
    );
    console.log(`Done. ${INDEX_NAME} now exists (or already did).`);

    const verification = await prisma.$queryRawUnsafe<Array<{ indexdef: string }>>(
      `SELECT indexdef FROM pg_indexes WHERE indexname = '${INDEX_NAME}'`,
    );
    console.log('Verified via pg_indexes:', verification);
  } catch (error) {
    console.error('Failed to create index:');
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (app) {
      await app.close();
    }
  }
}

main();
