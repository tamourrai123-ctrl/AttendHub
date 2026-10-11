import { Module } from '@nestjs/common';
import { SystemLogsModule } from '../system-logs/system-logs.module';
import { AuthModule } from '../auth/auth.module';
import { PlansController } from './plans.controller';
import { PricingService } from './pricing.service';
import { PrismaPlansRepository } from './repositories/prisma-plans.repository';

/**
 * Pricing module. Routes are mounted at /api/plans (see PlansController) —
 * the module/folder is still named "pricing" for continuity with Phase 4A's
 * folder structure.
 *
 * As of the Pricing Postgres migration, PrismaPlansRepository (the real
 * `pricing_master` table) replaces InMemoryPlansRepository — see that
 * repository's own doc comment for the column mapping. PrismaModule itself
 * is `@Global()` (see src/prisma/prisma.module.ts) and only needs importing
 * once in AppModule, so nothing extra is imported here for it.
 * InMemoryPlansRepository is left on disk, unused, the same way
 * InMemorySystemLogsRepository was left after its own migration.
 */
@Module({
  imports: [SystemLogsModule, AuthModule],
  controllers: [PlansController],
  providers: [PricingService, PrismaPlansRepository],
})
export class PricingModule {}
