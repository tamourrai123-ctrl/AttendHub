/**
 * One-off diagnostic — NOT part of the application.
 *
 * Prints the distinct values actually stored in usm_users.is_admin,
 * account_locked, and super_admin, so the Companies Prisma repository can
 * match against real values instead of a guessed Y/N convention. Read-only:
 * issues SELECTs only, no writes.
 *
 * Run once with: npx ts-node scripts/inspect-usm-users-flags.ts
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

    const distinctFlags = await prisma.usm_users.findMany({
      select: { is_admin: true, account_locked: true, super_admin: true },
      distinct: ['is_admin', 'account_locked', 'super_admin'],
    });
    console.log('Distinct (is_admin, account_locked, super_admin) combinations:');
    console.log(distinctFlags);

    const adminsPerCompany = await prisma.usm_users.groupBy({
      by: ['company_id', 'is_admin'],
      _count: true,
    });
    console.log('\nAdmin-flag counts per company_id (checking for exactly-one-admin assumption):');
    console.log(adminsPerCompany);
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
