import { Module } from '@nestjs/common';
import { IntegrationsModule } from '../integrations/integrations.module';
import { EmployeesModule } from '../employees/employees.module';
import { LeaveController } from './leave.controller';
import { LeaveService } from './leave.service';

/**
 * Leave module (read-only, live-fetched — Phase 2/Part C). Same shape as
 * AttendanceModule: imports IntegrationsModule for HrLiveFetchService and
 * EmployeesModule for employeeCode -> internal employee id resolution.
 *
 * InMemoryLeaveRepository is no longer wired in here (left on disk,
 * unused) — the request/approval model it backed has been replaced
 * entirely by the live balance-summary model (see LeaveRecord's doc
 * comment).
 */
@Module({
  imports: [IntegrationsModule, EmployeesModule],
  controllers: [LeaveController],
  providers: [LeaveService],
})
export class LeaveModule {}
