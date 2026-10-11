import { Injectable } from '@nestjs/common';
import { paginate, PaginatedResult } from '../common/utils/paginate';
import { HrLiveFetchService } from '../integrations/services/hr-live-fetch.service';
import { EmployeesService } from '../employees/employees.service';
import { ATTENDANCE_FETCH_ENDPOINT_NAME } from '../integrations/constants/reserved-endpoint-names.constant';
import { AttendanceRecord, AttendanceStatus } from './interfaces/attendance-record.interface';
import { AttendanceQueryDto } from './dto/attendance-query.dto';

/**
 * Attendance service — read-only, and (Phase 2/Part C) no longer backed by
 * any repository of AttendHub's own. Every call fetches live from the
 * company's connected HR system via HrLiveFetchService and maps the result
 * on the fly; nothing is ever stored here. This was an explicit product
 * decision: "attendance jaise hi log hogi wo portal se hr jayegi aur jo
 * fetch hogi wo hr se portal par show hogi" — attendance is recorded
 * straight to HR (see AttendancePunchService) and always DISPLAYED live
 * from HR, never from a local copy.
 *
 * The HR system's ATTENDANCE_FETCH endpoint only ever returns the fields
 * listed in constants/endpoint-purposes.constant.ts (employeeCode,
 * employeeName, date, status, checkInAt, checkOutAt, workingHours) — it has
 * no concept of AttendHub's own internal employee id. Each mapped row is
 * resolved back to an AttendHub Employee via its employeeCode (the HR
 * system's externalEmployeeId, same identity key Phase A.2 established) —
 * a row whose employeeCode isn't linked to any AttendHub employee yet is
 * skipped rather than shown with a made-up id, since there is no employee
 * profile screen it could correctly link to.
 */
@Injectable()
export class AttendanceService {
  constructor(
    private readonly hrLiveFetch: HrLiveFetchService,
    private readonly employeesService: EmployeesService,
  ) {}

  async findForCompany(companyId: string, query: AttendanceQueryDto): Promise<PaginatedResult<AttendanceRecord>> {
    const mapped = await this.fetchMappedRecords(companyId, query);
    const filtered = this.applyFilters(mapped, query);
    return paginate(filtered, query.page ?? 1, query.limit ?? 20);
  }

  /**
   * Used by GET /api/attendance/me — employeeId always comes from the
   * session, never the client. Any `employeeId` present on `query` is
   * ignored entirely here (not just overridden) so a mismatched value can
   * never zero-out or otherwise affect the caller's own results.
   */
  async findForEmployee(companyId: string, employeeId: string, query: AttendanceQueryDto): Promise<PaginatedResult<AttendanceRecord>> {
    const { employeeId: _ignoredEmployeeId, ...rest } = query;
    const mapped = await this.fetchMappedRecords(companyId, rest);
    const scoped = mapped.filter((record) => record.employeeId === employeeId);
    const filtered = this.applyFilters(scoped, rest);
    return paginate(filtered, query.page ?? 1, query.limit ?? 20);
  }

  /** Used internally by ReportsService — unfiltered company records for a date range. */
  async findRawForCompany(companyId: string): Promise<AttendanceRecord[]> {
    return this.fetchMappedRecords(companyId, {});
  }

  private async fetchMappedRecords(companyId: string, query: Partial<AttendanceQueryDto>): Promise<AttendanceRecord[]> {
    // Passed through in case the company's configured HR endpoint path uses
    // a {{date}}/{{startDate}}/{{endDate}} placeholder for server-side
    // filtering — a harmless no-op substitution when it doesn't (see
    // IntegrationEndpointExecutorService.buildUrl). applyFilters() below is
    // always applied afterwards regardless, so filtering is correct either way.
    const queryParams: Record<string, string> = {};
    if (query.date) queryParams.date = query.date;
    if (query.startDate) queryParams.startDate = query.startDate;
    if (query.endDate) queryParams.endDate = query.endDate;

    const { integrationId, records } = await this.hrLiveFetch.fetchMapped(companyId, ATTENDANCE_FETCH_ENDPOINT_NAME, queryParams);
    return this.toAttendanceRecords(companyId, integrationId, records);
  }

  private async toAttendanceRecords(
    companyId: string,
    integrationId: string,
    raw: Record<string, unknown>[],
  ): Promise<AttendanceRecord[]> {
    // Cached per call — a company's attendance list naturally repeats the
    // same handful of employeeCodes across many rows (one per day), so this
    // avoids resolving the same employee over and over within one request.
    const resolvedIds = new Map<string, string | null>();
    const results: AttendanceRecord[] = [];

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

      results.push({
        id: `${internalId}_${this.toStringOrEmpty(row.date)}`,
        employeeId: internalId,
        employeeCode,
        employeeName: this.toStringOrEmpty(row.employeeName),
        companyId,
        date: this.toStringOrEmpty(row.date),
        status: (row.status as AttendanceStatus) ?? 'ABSENT',
        checkInAt: (row.checkInAt as string | undefined) ?? null,
        checkOutAt: (row.checkOutAt as string | undefined) ?? null,
        workingHours: (row.workingHours as string | undefined) ?? null,
      });
    }

    return results;
  }

  private toStringOrEmpty(value: unknown): string {
    return value !== undefined && value !== null ? String(value) : '';
  }

  private applyFilters(records: AttendanceRecord[], query: Partial<AttendanceQueryDto>): AttendanceRecord[] {
    let results = records;

    if (query.employeeId) {
      results = results.filter((record) => record.employeeId === query.employeeId);
    }
    if (query.date) {
      results = results.filter((record) => record.date === query.date);
    }
    if (query.startDate) {
      results = results.filter((record) => record.date >= query.startDate!);
    }
    if (query.endDate) {
      results = results.filter((record) => record.date <= query.endDate!);
    }
    if (query.status && query.status !== 'ALL') {
      results = results.filter((record) => record.status === query.status);
    }
    if (query.search) {
      const term = query.search.trim().toLowerCase();
      if (term) {
        results = results.filter(
          (record) => record.employeeName.toLowerCase().includes(term) || record.employeeCode.toLowerCase().includes(term),
        );
      }
    }

    return results;
  }
}
