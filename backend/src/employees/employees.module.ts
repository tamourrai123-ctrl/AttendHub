import { Module } from '@nestjs/common';
import { SystemLogsModule } from '../system-logs/system-logs.module';
import { AuthModule } from '../auth/auth.module';
import { EmployeesController } from './employees.controller';
import { MeController } from './me.controller';
import { EmployeesService } from './employees.service';
import { PrismaEmployeesRepository } from './repositories/prisma-employees.repository';

/**
 * Employees module (Company Admin — tenant-scoped) plus the Employee's own
 * GET /api/me profile endpoint. Backed by the real usm_users table via
 * PrismaEmployeesRepository (see the Employees migration report).
 *
 * InMemoryEmployeesRepository is no longer wired in here (left on disk,
 * unused, the same way InMemoryCompaniesRepository/InMemoryIntegrationsRepository
 * were left after their respective migrations). Note: an earlier version
 * of this comment claimed Attendance/Leave/Reports reuse this repository,
 * but none of them actually inject it — each holds its own denormalized
 * employeeName/employeeCode — so nothing there needed to change.
 *
 * EmployeesService is now exported (Phase 2/Part B) — IntegrationsModule's
 * AttendancePunchService needs findSelf() to resolve the calling Employee's
 * externalEmployeeId (the HR system's own id for them) before forwarding a
 * mobile attendance punch. See integrations.module.ts, which imports this
 * module for exactly that.
 */
@Module({
  imports: [SystemLogsModule, AuthModule],
  controllers: [EmployeesController, MeController],
  providers: [EmployeesService, PrismaEmployeesRepository],
  exports: [EmployeesService],
})
export class EmployeesModule {}
