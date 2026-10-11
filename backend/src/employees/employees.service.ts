import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { paginatedResult, PaginatedResult, toSkipTake } from '../common/utils/paginate';
import { SystemLogsService } from '../system-logs/system-logs.service';
import { PrismaEmployeesRepository } from './repositories/prisma-employees.repository';
import { Employee } from './interfaces/employee.interface';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { ListEmployeesDto } from './dto/list-employees.dto';

/**
 * Employees service — every read/write here is scoped to a single
 * companyId, always taken from the authenticated Company Admin's session
 * (never from the request), backed by the real usm_users table via
 * PrismaEmployeesRepository. "Not found" is used uniformly for a genuinely
 * missing id, an id belonging to another company, AND an id that belongs
 * to a non-Employee row (a Company Admin/Super Admin) — the caller can't
 * distinguish any of these, which is what actually enforces isolation.
 */
@Injectable()
export class EmployeesService {
  constructor(
    private readonly repository: PrismaEmployeesRepository,
    private readonly systemLogsService: SystemLogsService,
  ) {}

  /**
   * Search and pagination both happen inside PrismaEmployeesRepository's
   * query now (WHERE + ORDER BY + skip/take, plus a separate count()).
   * This method only converts page/limit into skip/take and assembles the
   * response — it no longer fetches the whole company roster and
   * filters/slices it here.
   */
  async findAllForCompany(companyId: string, query: ListEmployeesDto): Promise<PaginatedResult<Employee>> {
    const { skip, take, page, limit } = toSkipTake(query.page, query.limit);

    const { employees, total } = await this.repository.findAllByCompany(companyId, {
      search: query.search,
      skip,
      take,
    });

    return paginatedResult(employees, page, limit, total);
  }

  async findOneForCompany(id: string, companyId: string): Promise<Employee> {
    const employee = await this.repository.findByIdInCompany(id, companyId);
    if (!employee) {
      throw new NotFoundException('Employee not found.');
    }
    return employee;
  }

  /** Used by GET /api/me — companyId and id both always come from the session (see MeController), never the client. */
  async findSelf(companyId: string, id: string): Promise<Employee> {
    const employee = await this.repository.findByIdInCompany(id, companyId);
    if (!employee) {
      throw new NotFoundException('Employee profile not found.');
    }
    return employee;
  }

  /**
   * Phase 2/Part C — used by AttendanceService/LeaveService to resolve one
   * live-fetched HR record's `employeeCode` back to AttendHub's own
   * internal Employee id, via the same (companyId, integrationId,
   * externalEmployeeId) identity key Phase A.2 already established for
   * employee-linking. Returns undefined (never throws) when no AttendHub
   * employee is linked to that HR code yet — callers treat that as "skip
   * this row" rather than an error, since a live HR system can easily
   * return records for people not yet linked in AttendHub.
   *
   * A thin wrapper around the repository so cross-module callers depend on
   * EmployeesService (already exported — see employees.module.ts) instead
   * of needing PrismaEmployeesRepository exported more broadly.
   */
  async findByExternalIdentity(companyId: string, integrationId: string, externalEmployeeId: string): Promise<Employee | undefined> {
    return this.repository.findByExternalIdentityInCompany(companyId, integrationId, externalEmployeeId);
  }

  /**
   * Phase A.2 — the minimal HR identity key (integrationId +
   * externalEmployeeId) must be supplied as a pair or not at all; a
   * half-set identity is never meaningful. Deliberately checked here, not
   * with class-validator on the DTO — see CreateEmployeeDto's doc comment
   * for why (PartialType's implicit @IsOptional on UpdateEmployeeDto would
   * defeat a cross-field @ValidateIf on a partial update).
   */
  private assertIdentityIsWholeOrEmpty(dto: Pick<CreateEmployeeDto, 'integrationId' | 'externalEmployeeId'>): void {
    const hasIntegrationId = dto.integrationId !== undefined;
    const hasExternalEmployeeId = dto.externalEmployeeId !== undefined;
    if (hasIntegrationId !== hasExternalEmployeeId) {
      throw new BadRequestException('integrationId and externalEmployeeId must be supplied together, or not at all.');
    }
  }

  async create(dto: CreateEmployeeDto, companyId: string, actorName: string): Promise<Employee> {
    this.assertIdentityIsWholeOrEmpty(dto);

    const existing = await this.repository.findByEmailInCompany(dto.email, companyId);
    if (existing) {
      throw new ConflictException('An employee with this email already exists in your company.');
    }

    if (dto.integrationId !== undefined && dto.externalEmployeeId !== undefined) {
      const existingByIdentity = await this.repository.findByExternalIdentityInCompany(
        companyId,
        dto.integrationId,
        dto.externalEmployeeId,
      );
      if (existingByIdentity) {
        throw new ConflictException('An employee with this integrationId/externalEmployeeId is already linked in your company.');
      }
    }

    const employee = await this.repository.create(dto, companyId);

    this.systemLogsService.record({
      user: actorName,
      action: 'EMPLOYEE_CREATED',
      resource: 'Employee',
      resourceId: employee.id,
      description: `Created employee ${employee.name}.`,
      metadata: {
        employeeId: employee.id,
        companyId,
        integrationId: employee.integrationId,
        externalEmployeeId: employee.externalEmployeeId,
      },
    });

    return employee;
  }

  async update(id: string, companyId: string, dto: UpdateEmployeeDto, actorName: string): Promise<Employee> {
    this.assertIdentityIsWholeOrEmpty(dto);

    const updated = await this.repository.updateInCompany(id, companyId, dto);
    if (!updated) {
      throw new NotFoundException('Employee not found.');
    }

    // c_password must never reach system_logs. Build "changes" explicitly
    // rather than spreading dto, matching the fix already applied to
    // Integrations credential rotation. There is no credential field left
    // to guard against here: UpdateEmployeeDto has no `password` field at
    // all (see its doc comment), so this can only ever log HR-data changes.
    const safeChanges: Record<string, unknown> = {};
    if (dto.name !== undefined) safeChanges.name = dto.name;
    if (dto.email !== undefined) safeChanges.email = dto.email;
    if (dto.phone !== undefined) safeChanges.phone = dto.phone;
    if (dto.mobile !== undefined) safeChanges.mobile = dto.mobile;
    if (dto.integrationId !== undefined) safeChanges.integrationId = dto.integrationId;
    if (dto.externalEmployeeId !== undefined) safeChanges.externalEmployeeId = dto.externalEmployeeId;

    this.systemLogsService.record({
      user: actorName,
      action: 'EMPLOYEE_UPDATED',
      resource: 'Employee',
      resourceId: updated.id,
      description: `Updated employee ${updated.name}.`,
      metadata: { employeeId: updated.id, companyId, changes: safeChanges },
    });

    return updated;
  }

  async remove(id: string, companyId: string, actorName: string): Promise<void> {
    const employee = await this.repository.findByIdInCompany(id, companyId);
    if (!employee) {
      throw new NotFoundException('Employee not found.');
    }

    await this.repository.removeInCompany(id, companyId);

    this.systemLogsService.record({
      user: actorName,
      action: 'EMPLOYEE_DELETED',
      resource: 'Employee',
      resourceId: id,
      severity: 'WARNING',
      description: `Deleted employee ${employee.name}.`,
      metadata: { employeeId: id, companyId },
    });
  }
}
