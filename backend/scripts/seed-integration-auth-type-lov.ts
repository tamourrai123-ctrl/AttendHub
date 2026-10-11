/**
 * One-off DATA seed — NOT part of the application, and NOT a Prisma
 * migration or schema change. Inserts rows into the already-existing
 * app_lov_master / app_lov_detail tables only.
 *
 * Why this script exists: scripts/inspect-hr-integration-foundation.ts and
 * scripts/inspect-lov-vu-definition.ts (run earlier, against the real
 * database) confirmed app_lov_master/app_lov_detail are both completely
 * empty — no LOV group of any name has ever been seeded. The HR
 * Integration Gateway feature's auth-type validation (see
 * src/lov/lov.service.ts, LOV_GROUPS.INTEGRATION_AUTH_TYPE) is genuinely
 * LOV-driven: it never falls back to a hardcoded whitelist, which means
 * until this group has real rows, IntegrationEndpointExecutorService will
 * correctly refuse to execute/test ANY endpoint (no auth type can ever be
 * "valid" against an empty group). Running this script is what makes the
 * feature usable end to end; not running it is also a valid choice (the
 * feature will just report "not configured yet" until you seed your own
 * values, however you choose to name them).
 *
 * IDs: app_lov_master.id and app_lov_detail.id are NOT auto-incrementing
 * (see prisma/schema.prisma — both are plain `BigInt`, no `@default`).
 * Since the tables are empty right now, this script uses 90001 for the
 * master row and 90001-90003 for its detail rows — an arbitrary reserved
 * range chosen only because nothing else exists yet. If your organization
 * has its own ID-allocation convention for LOV groups (e.g. a shared LOV
 * service used by other applications against this same database), REVIEW
 * AND ADJUST these IDs before running this script — this script has no way
 * to know about conventions that live outside this codebase.
 *
 * Codes: 'API' / 'BAS' / 'OAU' (VARCHAR(3), matching
 * integration_master.auth_type's column width) are conceptual codes
 * proposed by this feature — see
 * src/integrations/gateways/constants/auth-type-codes.constant.ts, which
 * MUST stay in sync with whatever `return` values actually exist in this
 * LOV group (the factory's dispatch switch is keyed on those constants,
 * not looked up dynamically — see that file's own comment for why).
 *
 * Safe to run more than once: uses `upsert`, not `create`.
 *
 * Run once with: npx ts-node scripts/seed-integration-auth-type-lov.ts
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { LOV_GROUPS } from '../src/lov/constants/lov-groups.constant';
import { AUTH_TYPE_CODES } from '../src/integrations/gateways/constants/auth-type-codes.constant';

const MASTER_ID = 90001n;

const DETAILS: Array<{ id: bigint; display: string; return: string; sorting: bigint }> = [
  { id: 90001n, display: 'API Key', return: AUTH_TYPE_CODES.API_KEY, sorting: 1n },
  { id: 90002n, display: 'Basic Auth', return: AUTH_TYPE_CODES.BASIC_AUTH, sorting: 2n },
  { id: 90003n, display: 'OAuth 2.0', return: AUTH_TYPE_CODES.OAUTH2, sorting: 3n },
];

async function main(): Promise<void> {
  let app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>> | undefined;

  try {
    app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
    const prisma = app.get(PrismaService);

    console.log(`Upserting app_lov_master id=${MASTER_ID} title="${LOV_GROUPS.INTEGRATION_AUTH_TYPE}"...`);
    await prisma.app_lov_master.upsert({
      where: { id: MASTER_ID },
      update: { title: LOV_GROUPS.INTEGRATION_AUTH_TYPE, show_hide_flag: 'Y' },
      create: { id: MASTER_ID, title: LOV_GROUPS.INTEGRATION_AUTH_TYPE, show_hide_flag: 'Y' },
    });

    for (const detail of DETAILS) {
      console.log(`Upserting app_lov_detail id=${detail.id} (${detail.display} -> ${detail.return})...`);
      await prisma.app_lov_detail.upsert({
        where: { pid_id: { pid: MASTER_ID, id: detail.id } },
        update: { display: detail.display, return: detail.return, sorting: detail.sorting, status: 'Y' },
        create: {
          id: detail.id,
          pid: MASTER_ID,
          display: detail.display,
          return: detail.return,
          sorting: detail.sorting,
          status: 'Y',
        },
      });
    }

    console.log('Done. Verifying via LovService-equivalent query...');
    const verification = await prisma.app_lov_master.findFirst({
      where: { title: LOV_GROUPS.INTEGRATION_AUTH_TYPE },
      include: { app_lov_detail: { orderBy: { sorting: 'asc' } } },
    });
    console.log(
      verification?.app_lov_detail.map((d) => ({ display: d.display, return: d.return, status: d.status })),
    );
  } catch (error) {
    console.error('Seed failed:');
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (app) {
      await app.close();
    }
  }
}

main();
