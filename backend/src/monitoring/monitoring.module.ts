import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { MonitoringController } from './monitoring.controller';
import { MonitoringService } from './monitoring.service';
import { PrismaMonitoringRepository } from './repositories/prisma-monitoring.repository';
import { MonitoringInterceptor } from '../common/interceptors/monitoring.interceptor';
import { SettingsModule } from '../settings/settings.module';

/**
 * Monitoring module. Registers MonitoringInterceptor as a global
 * APP_INTERCEPTOR from here (rather than main.ts) so it can have
 * MonitoringService injected via Nest's DI container.
 *
 * As of the Monitoring Postgres migration, PrismaMonitoringRepository (the
 * real `api_logs` table) replaces InMemoryMonitoringRepository — see that
 * repository's own doc comment for the column mapping. PrismaModule itself
 * is `@Global()` (see src/prisma/prisma.module.ts) and only needs importing
 * once in AppModule, so nothing extra is imported here for it.
 * InMemoryMonitoringRepository is left on disk, unused, the same way
 * InMemorySystemLogsRepository was left after its own migration.
 *
 * SettingsModule is imported so MonitoringService can inject
 * SettingsService and check the "API Failure Alerts" notification toggle
 * on every recorded call with statusCode >= 400 — see SettingsModule's own
 * doc comment for why this can never become a circular dependency (it's a
 * leaf module).
 */
@Module({
  imports: [SettingsModule],
  controllers: [MonitoringController],
  providers: [
    MonitoringService,
    PrismaMonitoringRepository,
    { provide: APP_INTERCEPTOR, useClass: MonitoringInterceptor },
  ],
})
export class MonitoringModule {}
