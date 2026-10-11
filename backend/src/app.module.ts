import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import configuration from './config/configuration';

import { AppController } from './app.controller';
import { AppService } from './app.service';

import { PrismaModule } from './prisma/prisma.module';
import { SystemLogsModule } from './system-logs/system-logs.module';
import { AuthModule } from './auth/auth.module';
import { CompaniesModule } from './companies/companies.module';
import { EmployeesModule } from './employees/employees.module';
import { AttendanceModule } from './attendance/attendance.module';
import { LeaveModule } from './leave/leave.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { PricingModule } from './pricing/pricing.module';
import { ReportsModule } from './reports/reports.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { SettingsModule } from './settings/settings.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    // Registered once, here, at the app root. Enables @Interval()/@Cron()
    // anywhere in the app — right now, only EmployeeSyncSchedulerService
    // (src/integrations/services/employee-sync-scheduler.service.ts), the
    // background half of Employee Sync. Needs the @nestjs/schedule package
    // (added to package.json) — run `npm install` after pulling this change.
    ScheduleModule.forRoot(),
    // PrismaModule is global (see prisma/prisma.module.ts) and only needs
    // to be imported once — it establishes the PostgreSQL connection but
    // is not yet consumed by any repository; every domain module below
    // still runs on its existing in-memory repository.
    PrismaModule,
    // SettingsModule is a dependency-free leaf module (see its own doc
    // comment) imported directly by AuthModule/SystemLogsModule/
    // MonitoringModule/IntegrationsModule below — listed here too only so
    // its own controller (GET/PATCH /api/settings) is actually mounted.
    SettingsModule,
    // SystemLogsModule and AuthModule first — most other feature modules
    // depend on one or both (audit logging, the global auth/roles guards,
    // and the shared users repository for resolving an actor's name).
    SystemLogsModule,
    AuthModule,
    CompaniesModule,
    EmployeesModule,
    AttendanceModule,
    LeaveModule,
    IntegrationsModule,
    PricingModule,
    ReportsModule,
    MonitoringModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
