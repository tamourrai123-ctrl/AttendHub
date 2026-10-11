/**
 * One-off DDL — NOT part of the application, and NOT a Prisma migration.
 * Optional; only run this if you want the index described below.
 *
 * Adds exactly one index, justified by a query pattern this task
 * introduces: EndpointsService.findAll() / PrismaEndpointsRepository.
 * findAllByIntegration() lists integration_detail rows filtered by
 * (company_id, integration_id) — every "list this integration's endpoints"
 * and every test-endpoint call's lookup goes through that same filter.
 *
 * integration_detail's only index today is its primary key on
 * (company_id, id) (map: "pk_id_id") — that does not serve a filter on
 * (company_id, integration_id) at all, since `id` and `integration_id` are
 * different columns. Postgres also does NOT automatically index foreign-key
 * columns (a common misconception) — integration_detail's FK to
 * integration_master via (company_id, integration_id) has no supporting
 * index unless one is added explicitly, confirmed by reading
 * prisma/schema.prisma directly.
 *
 * This does NOT use `prisma migrate dev` and does NOT modify
 * prisma/schema.prisma, per the project's established manual-index
 * convention (see scripts/add-companies-admin-email-index.ts from the
 * earlier Prisma repository-pattern fixes). CREATE INDEX CONCURRENTLY
 * avoids locking integration_detail against writes while it builds;
 * IF NOT EXISTS makes this safe to run more than once.
 *
 * Run once with: npx ts-node scripts/add-integration-detail-lookup-index.ts
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const INDEX_NAME = 'idx_integration_detail_company_integration';

async function main(): Promise<void> {
  let app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>> | undefined;

  try {
    app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
    const prisma = app.get(PrismaService);

    console.log(`Creating index ${INDEX_NAME} on integration_detail (if it does not already exist)...`);
    await prisma.$executeRawUnsafe(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS ${INDEX_NAME} ` +
        `ON integration_detail (company_id, integration_id)`,
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
