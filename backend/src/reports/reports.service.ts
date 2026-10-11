import { Injectable } from '@nestjs/common';
import { AttendanceService } from '../attendance/attendance.service';
import { AttendanceRecord } from '../attendance/interfaces/attendance-record.interface';
import {
  AttendanceSummary,
  CompanyAttendanceReport,
  DailyAttendanceReportRow,
  EmployeeAttendanceReportRow,
} from './interfaces/attendance-report.interface';
import { AttendanceReportQueryDto } from './dto/attendance-report-query.dto';

/**
 * Reports service — operates entirely through AttendanceService (never
 * queries anything directly), so this is simple aggregation, not a
 * reporting engine. No PDF/Excel export here — see Phase 4B section 21.
 *
 * Phase 2/Part C: AttendanceService.findRawForCompany() is now async (it
 * fetches live from HR rather than reading an in-memory repository), so
 * this method is now async too — everything below the fetch is unchanged,
 * still plain synchronous aggregation over whatever array comes back.
 */
@Injectable()
export class ReportsService {
  constructor(private readonly attendanceService: AttendanceService) {}

  async attendanceReport(companyId: string, query: AttendanceReportQueryDto): Promise<CompanyAttendanceReport> {
    let records = await this.attendanceService.findRawForCompany(companyId);

    if (query.employeeId) {
      records = records.filter((record) => record.employeeId === query.employeeId);
    }
    if (query.startDate) {
      records = records.filter((record) => record.date >= query.startDate!);
    }
    if (query.endDate) {
      records = records.filter((record) => record.date <= query.endDate!);
    }

    return {
      rangeLabel: this.rangeLabel(query),
      totals: this.summarize(records),
      byDate: this.groupByDate(records),
      byEmployee: this.groupByEmployee(records),
    };
  }

  private rangeLabel(query: AttendanceReportQueryDto): string {
    if (query.startDate && query.endDate) {
      return `${query.startDate} – ${query.endDate}`;
    }
    if (query.startDate) return `From ${query.startDate}`;
    if (query.endDate) return `Through ${query.endDate}`;
    return 'All available records';
  }

  private summarize(records: AttendanceRecord[]): AttendanceSummary {
    const summary: AttendanceSummary = { present: 0, absent: 0, late: 0, halfDay: 0, onLeave: 0, total: records.length };
    for (const record of records) {
      if (record.status === 'PRESENT') summary.present += 1;
      else if (record.status === 'ABSENT') summary.absent += 1;
      else if (record.status === 'LATE') summary.late += 1;
      else if (record.status === 'HALF_DAY') summary.halfDay += 1;
      else if (record.status === 'ON_LEAVE') summary.onLeave += 1;
    }
    return summary;
  }

  private groupByDate(records: AttendanceRecord[]): DailyAttendanceReportRow[] {
    const byDate = new Map<string, DailyAttendanceReportRow>();

    for (const record of records) {
      const row =
        byDate.get(record.date) ?? { date: record.date, present: 0, absent: 0, late: 0, halfDay: 0, onLeave: 0 };

      if (record.status === 'PRESENT') row.present += 1;
      else if (record.status === 'ABSENT') row.absent += 1;
      else if (record.status === 'LATE') row.late += 1;
      else if (record.status === 'HALF_DAY') row.halfDay += 1;
      else if (record.status === 'ON_LEAVE') row.onLeave += 1;

      byDate.set(record.date, row);
    }

    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  }

  private groupByEmployee(records: AttendanceRecord[]): EmployeeAttendanceReportRow[] {
    interface Accumulator extends EmployeeAttendanceReportRow {
      totalDays: number;
      creditedDays: number;
    }

    const byEmployee = new Map<string, Accumulator>();

    for (const record of records) {
      const row =
        byEmployee.get(record.employeeId) ??
        {
          employeeId: record.employeeId,
          employeeCode: record.employeeCode,
          employeeName: record.employeeName,
          presentDays: 0,
          absentDays: 0,
          lateDays: 0,
          attendanceRate: 0,
          totalDays: 0,
          creditedDays: 0,
        };

      row.totalDays += 1;
      if (record.status === 'PRESENT') {
        row.presentDays += 1;
        row.creditedDays += 1;
      } else if (record.status === 'ABSENT') {
        row.absentDays += 1;
      } else if (record.status === 'LATE') {
        row.lateDays += 1;
        row.creditedDays += 1;
      } else if (record.status === 'HALF_DAY') {
        row.creditedDays += 1;
      }

      byEmployee.set(record.employeeId, row);
    }

    return [...byEmployee.values()].map((row) => ({
      employeeId: row.employeeId,
      employeeCode: row.employeeCode,
      employeeName: row.employeeName,
      presentDays: row.presentDays,
      absentDays: row.absentDays,
      lateDays: row.lateDays,
      attendanceRate: row.totalDays > 0 ? Math.round((row.creditedDays / row.totalDays) * 100) : 0,
    }));
  }
}
