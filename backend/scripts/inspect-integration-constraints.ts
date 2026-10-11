/**
 * One-off diagnostic — NOT part of the application.
 *
 * Reads the actual CHECK constraint definitions on integration_master and
 * integration_detail (Prisma's introspection only flags that these exist,
 * it doesn't decode them) plus row counts, via Postgres system catalogs.
 * Read-only: pg_get_constraintdef + SELECTs only, no writes.
 *
 * Run once with: npx ts-node scripts/inspect-integration-constraints.ts
 * Safe to delete after use.
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

async function main(): Promise<void> {
  let app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>> | undefined;

  try {
    app = await NestFactory.createApplicationContext(AppModule, {
      logger: ['error', 'warn'],
    });
    const prisma = app.get(PrismaService);

    const constraints = await prisma.$queryRaw`
      SELECT conname, conrelid::regclass::text AS table_name, pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conname IN ('chk_integration_master_status', 'chk_integration_detail_status')
    `;
    console.log('CHECK constraint definitions:');
    console.log(constraints);

    const masterCount = await prisma.integration_master.count();
    const detailCount = await prisma.integration_detail.count();
    console.log(`\nintegration_master row count: ${masterCount}`);
    console.log(`integration_detail row count: ${detailCount}`);

    if (masterCount > 0) {
      const sample = await prisma.integration_master.findMany({ take: 5 });
      console.log('\nSample integration_master rows:');
      console.log(sample);
    }
  } catch (error) {
    console.error('Inspection failed:');
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (app) {
      await app.close();
    }
  }
}

main();
