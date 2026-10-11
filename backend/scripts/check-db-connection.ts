/**
 * Standalone PostgreSQL connectivity smoke test.
 *
 * Boots the real AppModule (no HTTP listener) so this exercises the exact
 * same DI graph — ConfigModule reading .env, PrismaModule, all ten domain
 * modules — that `npm run start:dev` boots. If the whole app can't start,
 * this fails the same way start:dev would; if it starts, it then runs one
 * raw query to confirm the Postgres connection actually works end to end.
 *
 * This is intentionally NOT a Jest test: the existing `npm test` / `npm run
 * test:e2e` suites must keep passing without a live database, so this
 * check is run manually and separately:
 *
 *   npm run db:check
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
    const result = await prisma.$queryRaw`SELECT 1 as result`;

    console.log('Database connection successful.');
    console.log(result);
  } catch (error) {
    console.error('Database connection failed:');
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (app) {
      await app.close();
    }
  }
}

main();
