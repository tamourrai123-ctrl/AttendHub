/**
 * One-off diagnostic — NOT part of the application. Read-only.
 *
 * Follow-up to inspect-hr-integration-foundation.ts: that script confirmed
 * `lov_vu` exists as a real Postgres VIEW with columns
 * (lov_id, lov_name, title, value, sorting, status) but currently has ZERO
 * rows (app_lov_master/app_lov_detail are both empty in this database, and
 * a grep of the entire backend src/ tree found no existing module that
 * references lov_vu/app_lov_master/app_lov_detail at all — this really is
 * greenfield for this codebase).
 *
 * Before writing a repository/service that queries lov_vu, we need the
 * view's actual SQL definition — not a guess from column names alone — so
 * we know exactly which app_lov_master/app_lov_detail columns feed
 * lov_name/title/value, and what "lov_name" values (i.e. LOV group names)
 * the rest of the system is expected to use.
 *
 * Run once with: npx ts-node scripts/inspect-lov-vu-definition.ts
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

    console.log('\n=== lov_vu view definition (pg_views) ===');
    const viewDef = await prisma.$queryRawUnsafe<Array<{ definition: string }>>(
      `SELECT definition FROM pg_views WHERE viewname = 'lov_vu'`,
    );
    console.log(viewDef);

    console.log('\n=== lov_vu view definition (pg_get_viewdef, formatted) ===');
    const viewDef2 = await prisma.$queryRawUnsafe<Array<{ def: string }>>(
      `SELECT pg_get_viewdef('lov_vu'::regclass, true) AS def`,
    );
    console.log(viewDef2);

    console.log('\n=== Any distinct lov_name values already used ANYWHERE in this database (in case seed data exists under a different LOV table not yet considered) ===');
    const distinctLovNames = await prisma.$queryRawUnsafe<Array<{ lov_name: string }>>(
      `SELECT DISTINCT lov_name FROM lov_vu`,
    );
    console.log(distinctLovNames);

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
