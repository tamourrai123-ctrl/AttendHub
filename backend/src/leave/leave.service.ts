import { Injectable } from '@nestjs/common';
import { paginate, PaginatedResult } from '../common/utils/paginate';
import { HrLiveFetchService } from '../integrations/services/hr-live-fetch.service';
import { EmployeesService } from '../employees/employees.service';
import { LEAVE_ENDPOINT_NAME } from '../integrations/constants/reserved-endpoint-names.constant';
import { LeaveRecord } from './interfaces/leave-record.interface';
import { LeaveQueryDto } from './dto/leave-query.dto';

/**
 * Leave service — read-only, live-fetched (Phase 2/Part C), same pattern as
 * AttendanceService. No repository of AttendHub's own: every call fetches
 * the company's current leave balances live from HR via HrLiveFetchService
 * and maps the result on the fly.
 *
 * The HR system's LEAVE endpoint returns the fixed fields listed in
 * constants/endpoint-purposes.constant.ts (employeeCode, employeeName,
 * leaveType, totalLeaveDays, entitledLeave, consumedLeave,
 * availableLeaveBalance, leaveStatus). Each mapped row is resolved back to
 * an AttendHub Employee via employeeCode, same identity key and same
 * "skip rows for employees not linked yet" rule as AttendanceService.
 */
@Injectable()
export class LeaveService {
  constructor(
    private readonly hrLiveFetch: HrLiveFetchService,
    private readonly employeesService: EmployeesService,
  ) {}

  async findForCompany(companyId: string, query: LeaveQueryDto): Promise<PaginatedResult<LeaveRecord>> {
    const mapped = await this.fetchMappedRecords(companyId);
    const filtered = this.applyFilters(mapped, query);
    return paginate(filtered, query.page ?? 1, query.limit ?? 20);
  }

  private async fetchMappedRecords(companyId: string): Promise<LeaveRecord[]> {
    const { integrationId, records } = await this.hrLiveFetch.fetchMapped(companyId, LEAVE_ENDPOINT_NAME, {});
    return this.toLeaveRecords(companyId, integrationId, records);
  }

  private async toLeaveRecords(companyId: string, integrationId: string, raw: Record<string, unknown>[]): Promise<LeaveRecord[]> {
    const resolvedIds = new Map<string, string | null>();
    const results: LeaveRecord[] = [];
    let rowIndex = 0;

    for (const row of raw) {
      const employeeCode = this.toStringOrEmpty(row.employeeCode);
      if (!employeeCode) continue;

      let internalId = resolvedIds.get(employeeCode);
      if (internalId === undefined) {
        const employee = await this.employeesService.findByExternalIdentity(companyId, integrationId, employeeCode);
        internalId = employee ? employee.id : null;
        resolvedIds.set(employeeCode, internalId);
      }
      if (!internalId) continue;

      rowIndex += 1;
      results.push({
        // One employee can have several rows (one per leave type), so the
        // id is synthesized from the internal employee id, leave type, and
        // a per-request row index — unique enough for a React list key,
        // never persisted or looked up by anyone.
        id: `${internalId}_${this.toStringOrEmpty(row.leaveType) || 'leave'}_${rowIndex}`,
        employeeId: internalId,
        employeeName: this.toStringOrEmpty(row.employeeName),
        companyId,
        leaveType: this.toStringOrEmpty(row.leaveType),
        totalLeaveDays: this.toNumber(row.totalLeaveDays),
        entitledLeave: this.toNumber(row.entitledLeave),
        consumedLeave: this.toNumber(row.consumedLeave),
        availableLeaveBalance: this.toNumber(row.availableLeaveBalance),
        leaveStatus: this.toStringOrEmpty(row.leaveStatus),
      });
    }

    return results;
  }

  private toStringOrEmpty(value: unknown): string {
    return value !== undefined && value !== null ? String(value) : '';
  }

  private toNumber(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private applyFilters(records: LeaveRecord[], query: Partial<LeaveQueryDto>): LeaveRecord[] {
    let results = records;

    if (query.employeeId) {
      results = results.filter((record) => record.employeeId === query.employeeId);
    }
    if (query.leaveType) {
      results = results.filter((record) => record.leaveType === query.leaveType);
    }
    if (query.search) {
      const term = query.search.trim().toLowerCase();
      if (term) {
        results = results.filter(
          (record) => record.employeeName.toLowerCase().includes(term) || record.leaveType.toLowerCase().includes(term),
        );
      }
    }

    return results;
  }
}
