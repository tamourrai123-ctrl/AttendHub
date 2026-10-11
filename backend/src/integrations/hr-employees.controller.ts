import { BadRequestException, Controller, ForbiddenException, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/constants/roles.enum';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { ok } from '../common/dto/api-response.dto';
import { InMemoryUsersRepository } from '../auth/repositories/in-memory-users.repository';
import { SystemLogsService } from '../system-logs/system-logs.service';
import { HrEmployeesService } from './services/hr-employees.service';
import { EmployeeSyncService } from './services/employee-sync.service';

/**
 * Live HR-employee routes, nested under a specific integration:
 * /integrations/:integrationId/hr-employees. Unlike the endpoint/field-
 * mapping CRUD controllers, this makes a real outbound call to the external
 * HR system on every request — nothing here is a stored-configuration read.
 *
 * Company Admin only, no Super Admin view access — grouped with the other
 * "live outbound call" actions (EndpointsController.test()) rather than
 * with the "view configuration" routes, since this reaches out to a real
 * external system on the company's behalf every time it's called, not just
 * inspects AttendHub's own stored config.
 *
 * Uses the same companyId-resolution pattern as every other controller in
 * this module (a required `companyId` query parameter, checked against the
 * caller's own company) — see IntegrationsController.resolveCompanyId() for
 * the original rationale.
 */
@ApiTags('integration-hr-employees')
@ApiBearerAuth()
@Controller('integrations/:integrationId/hr-employees')
@Roles(Role.COMPANY_ADMIN)
export class HrEmployeesController {
  constructor(
    private readonly hrEmployeesService: HrEmployeesService,
    private readonly employeeSyncService: EmployeeSyncService,
    private readonly usersRepository: InMemoryUsersRepository,
    private readonly systemLogsService: SystemLogsService,
  ) {}

  private actorName(user: AuthenticatedUser): string {
    return this.usersRepository.findById(user.userId)?.name ?? user.userId;
  }

  private resolveCompanyId(user: AuthenticatedUser, companyId: string | undefined): string {
    if (!companyId) {
      throw new BadRequestException('companyId query parameter is required.');
    }
    if (user.companyId !== companyId) {
      throw new ForbiddenException("You do not have permission to access this company's integration.");
    }
    return companyId;
  }

  @Get()
  @ApiQuery({ name: 'companyId', required: true })
  @ApiOperation({
    summary: "List the HR system's employees, live (Company Admin only).",
    description:
      'Makes a real outbound call to the endpoint configured as "EMPLOYEES" for this integration, and returns the ' +
      'response mapped through that endpoint\'s active field mappings. Nothing here is persisted or cached — used ' +
      'for the employee-linking picker.',
  })
  async listEmployees(
    @Param('integrationId') integrationId: string,
    @Query('companyId') companyId: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const resolvedCompanyId = this.resolveCompanyId(user, companyId);
    const employees = await this.hrEmployeesService.listEmployees(resolvedCompanyId, integrationId);

    // Count only — the mapped employee records may carry real HR PII
    // (name/email/department) and must never reach system_logs.
    this.systemLogsService.record({
      user: this.actorName(user),
      action: 'HR_EMPLOYEES_LISTED',
      resource: 'HrEmployee',
      description: `Listed ${employees.length} HR employee(s) for integration ${integrationId}.`,
      metadata: { integrationId, companyId: resolvedCompanyId, count: employees.length },
    });

    return ok(employees);
  }

  @Get(':externalEmployeeId')
  @ApiQuery({ name: 'companyId', required: true })
  @ApiOperation({
    summary: "Fetch one employee's live HR details by external id (Company Admin only).",
    description:
      'Makes a real outbound call to the "EMPLOYEES" endpoint, filtered to one employee where the HR API supports ' +
      'it. Nothing here is persisted or cached — used to display live HR fields on an already-linked employee.',
  })
  async getEmployeeDetail(
    @Param('integrationId') integrationId: string,
    @Param('externalEmployeeId') externalEmployeeId: string,
    @Query('companyId') companyId: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const resolvedCompanyId = this.resolveCompanyId(user, companyId);
    const employee = await this.hrEmployeesService.getEmployeeDetail(resolvedCompanyId, integrationId, externalEmployeeId);

    this.systemLogsService.record({
      user: this.actorName(user),
      action: 'HR_EMPLOYEE_DETAIL_FETCHED',
      resource: 'HrEmployee',
      resourceId: externalEmployeeId,
      description: `Fetched live HR details for external employee ${externalEmployeeId} (integration ${integrationId}).`,
      metadata: { integrationId, companyId: resolvedCompanyId, externalEmployeeId },
    });

    return ok(employee);
  }

  @Post('sync')
  @ApiQuery({ name: 'companyId', required: true })
  @ApiOperation({
    summary: 'Sync employees from the HR system into AttendHub (Company Admin only, manual "Sync Now" trigger).',
    description:
      'Fetches the full HR employee list via the same "EMPLOYEES" endpoint used for live lookups, then creates ' +
      "any AttendHub employee not yet linked, and updates name/email for ones that changed. Never deletes or " +
      "deactivates an AttendHub employee — a record the HR system stops returning is simply left as-is. Runs " +
      'automatically in the background too (see EmployeeSyncSchedulerService); this route is the manual trigger, ' +
      'and returns the same result shape either way.',
  })
  async sync(
    @Param('integrationId') integrationId: string,
    @Query('companyId') companyId: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const resolvedCompanyId = this.resolveCompanyId(user, companyId);
    const result = await this.employeeSyncService.syncCompany(resolvedCompanyId, integrationId);

    // Counts and error strings only — never the raw HR records, same
    // PII-safety rule as every other route in this controller.
    this.systemLogsService.record({
      user: this.actorName(user),
      action: 'HR_EMPLOYEES_SYNCED',
      resource: 'HrEmployee',
      description:
        `Synced employees for integration ${integrationId}: ${result.totalFetched} fetched, ${result.created} ` +
        `created, ${result.updated} updated, ${result.unchanged} unchanged, ${result.skipped} skipped, ` +
        `${result.failed} failed.`,
      // result already carries companyId/integrationId (EmployeeSyncService
      // echoes back exactly what was passed in — see its syncCompany()) —
      // spreading it alone avoids the redundant/conflicting explicit
      // properties the previous version of this line had (TS2783: a named
      // property before a spread that structurally already has that key).
      metadata: { ...result },
    });

    return ok(result);
  }
}
