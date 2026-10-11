import { Module } from '@nestjs/common';
import { SystemLogsModule } from '../system-logs/system-logs.module';
import { AuthModule } from '../auth/auth.module';
import { CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';
import { PrismaCompaniesRepository } from './repositories/prisma-companies.repository';

/**
 * Companies module (Super Admin — global tenant management).
 *
 * As of the Phase 4 database migration, this module is backed by
 * PrismaCompaniesRepository (real `usm_company` table) instead of the old
 * InMemoryCompaniesRepository — the first (and so far only) module moved
 * off in-memory storage. That file is left in place, unused, rather than
 * deleted. PrismaModule itself is `@Global()` (see src/prisma/prisma.module.ts)
 * and only needs importing once in AppModule, so nothing extra is imported
 * here for it.
 */
@Module({
  imports: [SystemLogsModule, AuthModule],
  controllers: [CompaniesController],
  providers: [CompaniesService, PrismaCompaniesRepository],
  exports: [PrismaCompaniesRepository],
})
export class CompaniesModule {}
