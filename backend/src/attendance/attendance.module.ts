import { Module } from '@nestjs/common';
import { IntegrationsModule } from '../integrations/integrations.module';
import { EmployeesModule } from '../employees/employees.module';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';

/**
 * Attendance module (read-only, live-fetched — Phase 2/Part C). Exports
 * AttendanceService — ReportsModule reuses it directly rather than querying
 * anything itself, so the "no mutation, always live" guarantee and the
 * employeeCode-resolution logic stay in one place.
 *
 * Imports IntegrationsModule for HrLiveFetchService (the live HR call +
 * field-mapping) and EmployeesModule for EmployeesService
 * (employeeCode -> internal employee id resolution). No circular
 * dependency: IntegrationsModule/EmployeesModule never import this module.
 *
 * InMemoryAttendanceRepository is no longer wired in here (left on disk,
 * unused, same as every other repository retired by a live-fetch/Prisma
 * migration in this codebase).
 */
@Module({
  imports: [IntegrationsModule, EmployeesModule],
  controllers: [AttendanceController],
  providers: [AttendanceService],
  exports: [AttendanceService],
})
export class AttendanceModule {}
