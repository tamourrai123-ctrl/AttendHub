/**
 * One-off diagnostic — NOT part of the application. Read-only.
 *
 * Run BEFORE implementing Phase 4F (persistent field mapping), per that
 * task's explicit "inspect the real database before assuming" requirement.
 * Answers:
 *
 * 1. Does `integration_field_mapping` already exist? (Must not create a
 *    duplicate table if so.)
 * 2. What indexes currently exist on integration_master/integration_detail
 *    (in particular: was the optional
 *    scripts/add-integration-detail-lookup-index.ts ever run?).
 * 3. The real PK/FK constraint names on usm_company/integration_master/
 *    integration_detail, re-confirmed directly from the live database
 *    rather than trusted from memory of earlier phases.
 * 4. Whether the optional scripts/seed-integration-auth-type-lov.ts was
 *    ever run (does app_lov_master have an INTEGRATION_AUTH_TYPE group?).
 *
 * Run once with: npx ts-node scripts/inspect-field-mapping-schema.ts
 * Safe to delete after use.
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

async function main(): Promise<void> {
  let app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>> | undefined;

  try {
    app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
    const prisma = app.get(PrismaService);

    console.log('\n=== 1. Does integration_field_mapping already exist? ===');
    const existing = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'integration_field_mapping'`,
    );
    console.log(existing);
    if (existing.length > 0) {
      console.log('--- existing columns ---');
      const cols = await prisma.$queryRawUnsafe(
        `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='integration_field_mapping' ORDER BY ordinal_position`,
      );
      console.log(cols);
      console.log('--- existing constraints ---');
      const constraints = await prisma.$queryRawUnsafe(
        `SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'integration_field_mapping'::regclass`,
      );
      console.log(constraints);
      console.log('--- existing indexes ---');
      const idx = await prisma.$queryRawUnsafe(`SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'integration_field_mapping'`);
      console.log(idx);
    }

    console.log('\n=== 2. Current indexes on integration_master ===');
    console.log(await prisma.$queryRawUnsafe(`SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'integration_master'`));

    console.log('\n=== 3. Current indexes on integration_detail ===');
    console.log(await prisma.$queryRawUnsafe(`SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'integration_detail'`));

    console.log('\n=== 4. Current indexes on usm_company ===');
    console.log(await prisma.$queryRawUnsafe(`SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'usm_company'`));

    console.log('\n=== 5. PK/FK constraint definitions: usm_company, integration_master, integration_detail ===');
    console.log(
      await prisma.$queryRawUnsafe(
        `SELECT conrelid::regclass AS table_name, conname, pg_get_constraintdef(oid) AS def
         FROM pg_constraint
         WHERE conrelid IN ('usm_company'::regclass, 'integration_master'::regclass, 'integration_detail'::regclass)
         ORDER BY table_name, conname`,
      ),
    );

    console.log('\n=== 6. Was scripts/seed-integration-auth-type-lov.ts ever run? (app_lov_master INTEGRATION_AUTH_TYPE group) ===');
    const lov = await prisma.app_lov_master.findFirst({
      where: { title: 'INTEGRATION_AUTH_TYPE' },
      include: { app_lov_detail: true },
    });
    console.log(lov ? { id: lov.id.toString(), details: lov.app_lov_detail.map((d) => ({ display: d.display, return: d.return })) } : null);

    console.log('\n=== 7. Row counts (sanity check, not exhaustive) ===');
    console.log({
      integration_master: await prisma.integration_master.count(),
      integration_detail: await prisma.integration_detail.count(),
      usm_company: await prisma.usm_company.count(),
    });

    console.log('\nDone.');
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
