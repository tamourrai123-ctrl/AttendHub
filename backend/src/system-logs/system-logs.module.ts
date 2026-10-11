import { Module } from '@nestjs/common';
import { SystemLogsController } from './system-logs.controller';
import { SystemLogsService } from './system-logs.service';
import { PrismaSystemLogsRepository } from './repositories/prisma-system-logs.repository';
import { SettingsModule } from '../settings/settings.module';

/**
 * System logs module.
 *
 * Exports SystemLogsService so other feature modules (auth, companies,
 * employees, integrations, pricing) can record audit entries when they
 * create/update/delete something or when a user logs in/out.
 *
 * As of Phase A.1 (the System Logs database migration), this module is
 * backed by PrismaSystemLogsRepository (the real `system_logs` table)
 * instead of InMemorySystemLogsRepository — see PrismaSystemLogsRepository's
 * class doc comment for the column mapping and documented compatibility
 * gaps. InMemorySystemLogsRepository is no longer wired in here (left on
 * disk, unused, the same way InMemoryCompaniesRepository/
 * InMemoryIntegrationsRepository were left after their own migrations).
 * PrismaModule itself is `@Global()` (see src/prisma/prisma.module.ts) and
 * only needs importing once in AppModule, so nothing extra is imported here
 * for it.
 *
 * SettingsModule is imported so SystemLogsService can inject
 * SettingsService and check the "System Error Alerts" notification toggle
 * on every ERROR/CRITICAL entry it records — see SettingsModule's own doc
 * comment for why this can never become a circular dependency (it's a leaf
 * module).
 */
@Module({
  imports: [SettingsModule],
  controllers: [SystemLogsController],
  providers: [SystemLogsService, PrismaSystemLogsRepository],
  exports: [SystemLogsService],
})
export class SystemLogsModule {}
