/**
 * One-off diagnostic — NOT part of the application.
 *
 * Prints existing usm_company rows (a subset of columns only) to learn the
 * real id/shortname/country conventions before writing create() logic for
 * the Prisma-backed CompaniesRepository. Read-only, no writes.
 *
 * Run once with: npx ts-node scripts/inspect-usm-company-rows.ts
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

    const rows = await prisma.usm_company.findMany({
      select: {
        id: true,
        title: true,
        shortname: true,
        country: true,
        status: true,
        pid: true,
      },
      orderBy: { id: 'asc' },
    });

    console.log(`Found ${rows.length} usm_company row(s):`);
    console.log(rows);

    const distinctCountries = await prisma.usm_company.findMany({
      select: { country: true },
      distinct: ['country'],
    });
    console.log('\nDistinct country values in use:');
    console.log(distinctCountries);
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
