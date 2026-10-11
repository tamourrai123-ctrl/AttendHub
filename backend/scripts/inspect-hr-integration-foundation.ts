/**
 * One-off diagnostic — NOT part of the application. Read-only: issues
 * SELECTs only, no writes.
 *
 * Run BEFORE implementing the HR Integration Gateway foundation task, to
 * answer three questions the task explicitly requires inspecting rather
 * than assuming:
 *
 * 1. Does app_lov_master/app_lov_detail already contain rows for an
 *    "Integration Auth Type" (or similarly named) LOV group, and if so,
 *    what are the real `return` codes (API/BAS/OAU are only conceptual
 *    examples in the task, not confirmed values)?
 * 2. Does `lov_vu` exist as a database view? It's mentioned in the task as
 *    an existing LOV-related object, but it is NOT present in
 *    prisma/schema.prisma (Prisma's default introspection does not
 *    capture views unless the `views` preview feature is enabled, which
 *    this project's schema does not have) — so its shape is currently
 *    invisible to the app entirely.
 * 3. Does any existing table in the public schema already support
 *    generic field-mapping/transformation storage (name containing
 *    "map"/"mapping"/"field"), so a custom mapping table isn't
 *    duplicated if one already exists?
 *
 * It also samples any existing integration_master/integration_detail rows,
 * in case real auth_type/integration_type/http_method values already show
 * real-world convention (the tables may well be empty, same as usm_users
 * was before the Employees migration).
 *
 * Run once with: npx ts-node scripts/inspect-hr-integration-foundation.ts
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

    console.log('\n=== 1. app_lov_master (all rows) ===');
    const lovMasters = await prisma.app_lov_master.findMany();
    console.log(lovMasters);

    console.log('\n=== 2. app_lov_detail (all rows, with parent title) ===');
    const lovDetails = await prisma.app_lov_detail.findMany({ include: { app_lov_master: true } });
    console.log(
      lovDetails.map((d) => ({
        masterTitle: d.app_lov_master.title,
        pid: d.pid.toString(),
        id: d.id.toString(),
        display: d.display,
        return: d.return,
        status: d.status,
      })),
    );

    console.log('\n=== 3. Does a "lov_vu" table/view exist in the public schema? ===');
    const lovVuExists = await prisma.$queryRawUnsafe<Array<{ table_name: string; table_type: string }>>(
      `SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'lov_vu'`,
    );
    console.log(lovVuExists);
    if (lovVuExists.length > 0) {
      console.log('--- lov_vu columns ---');
      const lovVuColumns = await prisma.$queryRawUnsafe<Array<{ column_name: string; data_type: string }>>(
        `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'lov_vu' ORDER BY ordinal_position`,
      );
      console.log(lovVuColumns);
      console.log('--- lov_vu sample rows (up to 50) ---');
      const lovVuRows = await prisma.$queryRawUnsafe(`SELECT * FROM lov_vu LIMIT 50`);
      console.log(lovVuRows);
    }

    console.log('\n=== 4. Every table/view actually in the public schema (full inventory) ===');
    const allTables = await prisma.$queryRawUnsafe<Array<{ table_name: string; table_type: string }>>(
      `SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
    );
    console.log(allTables);

    console.log('\n=== 5. Any existing table whose name suggests field-mapping storage ===');
    const mappingLikeTables = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND (table_name ILIKE '%map%' OR table_name ILIKE '%field%')`,
    );
    console.log(mappingLikeTables);

    console.log('\n=== 6. Existing integration_master rows (auth_type/integration_type/api_version actually stored) ===');
    const integrationMasters = await prisma.integration_master.findMany({
      select: { id: true, company_id: true, integration_type: true, auth_type: true, api_version: true, status: true },
    });
    console.log(integrationMasters.map((r) => ({ ...r, id: r.id.toString() })));

    console.log('\n=== 7. Existing integration_detail rows (http_method/request_type/response_type actually stored) ===');
    const integrationDetails = await prisma.integration_detail.findMany({
      select: {
        id: true,
        company_id: true,
        integration_id: true,
        name: true,
        endpoint: true,
        http_method: true,
        request_type: true,
        response_type: true,
        status: true,
      },
    });
    console.log(
      integrationDetails.map((r) => ({ ...r, id: r.id.toString(), integration_id: r.integration_id.toString() })),
    );

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
