import { Injectable } from '@nestjs/common';
import { AttendanceRecord } from '../interfaces/attendance-record.interface';

/**
 * InMemoryAttendanceRepository — temporary development storage representing
 * data AttendHub would receive FROM the connected HR system. There is no
 * write/mutation method on this repository at all (no check-in/check-out,
 * no edit, no delete) — that's deliberate, matching the Phase 4B rule that
 * HR software remains the authoritative source of attendance and AttendHub
 * only ever reads it.
 *
 * Seed data covers a handful of recent dates for cmp_001's employees (used
 * by reports/tests), plus a couple of cmp_002 records that must never be
 * visible to a cmp_001 Company Admin or to emp_001 — the tenant/self
 * isolation fixtures.
 */
@Injectable()
export class InMemoryAttendanceRepository {
  private readonly records: AttendanceRecord[] = [
    // emp_001 (John Carter, cmp_001) — mixed statuses across 5 days, used by report tests.
    { id: 'att_001', employeeId: 'emp_001', employeeCode: 'EMP-1001', employeeName: 'John Carter', companyId: 'cmp_001', date: '2026-09-07', status: 'PRESENT', checkInAt: '2026-09-07T09:02:00Z', checkOutAt: '2026-09-07T17:05:00Z', workingHours: '8h 3m' },
    { id: 'att_002', employeeId: 'emp_001', employeeCode: 'EMP-1001', employeeName: 'John Carter', companyId: 'cmp_001', date: '2026-09-08', status: 'PRESENT', checkInAt: '2026-09-08T08:58:00Z', checkOutAt: '2026-09-08T17:00:00Z', workingHours: '8h 2m' },
    { id: 'att_003', employeeId: 'emp_001', employeeCode: 'EMP-1001', employeeName: 'John Carter', companyId: 'cmp_001', date: '2026-09-09', status: 'LATE', checkInAt: '2026-09-09T09:45:00Z', checkOutAt: '2026-09-09T17:10:00Z', workingHours: '7h 25m' },
    { id: 'att_004', employeeId: 'emp_001', employeeCode: 'EMP-1001', employeeName: 'John Carter', companyId: 'cmp_001', date: '2026-09-10', status: 'ABSENT', checkInAt: null, checkOutAt: null, workingHours: null },
    { id: 'att_005', employeeId: 'emp_001', employeeCode: 'EMP-1001', employeeName: 'John Carter', companyId: 'cmp_001', date: '2026-09-11', status: 'PRESENT', checkInAt: '2026-09-11T09:00:00Z', checkOutAt: '2026-09-11T17:00:00Z', workingHours: '8h 0m' },

    // emp_002 (Fatima Noor, cmp_001)
    { id: 'att_006', employeeId: 'emp_002', employeeCode: 'EMP-1002', employeeName: 'Fatima Noor', companyId: 'cmp_001', date: '2026-09-10', status: 'PRESENT', checkInAt: '2026-09-10T09:05:00Z', checkOutAt: '2026-09-10T17:15:00Z', workingHours: '8h 10m' },
    { id: 'att_007', employeeId: 'emp_002', employeeCode: 'EMP-1002', employeeName: 'Fatima Noor', companyId: 'cmp_001', date: '2026-09-11', status: 'HALF_DAY', checkInAt: '2026-09-11T09:00:00Z', checkOutAt: '2026-09-11T13:00:00Z', workingHours: '4h 0m' },

    // emp_003 (Ahmed Raza, cmp_001) — on leave, matches mock/leave.ts lv_002.
    { id: 'att_008', employeeId: 'emp_003', employeeCode: 'EMP-1003', employeeName: 'Ahmed Raza', companyId: 'cmp_001', date: '2026-09-11', status: 'ON_LEAVE', checkInAt: null, checkOutAt: null, workingHours: null },

    // cmp_002 records — must NEVER appear for a cmp_001 Company Admin or for emp_001.
    { id: 'att_101', employeeId: 'emp_101', employeeCode: 'EMP-2001', employeeName: 'Nida Farooq', companyId: 'cmp_002', date: '2026-09-11', status: 'PRESENT', checkInAt: '2026-09-11T09:00:00Z', checkOutAt: '2026-09-11T17:00:00Z', workingHours: '8h 0m' },
    { id: 'att_102', employeeId: 'emp_102', employeeCode: 'EMP-2002', employeeName: 'Owais Anwar', companyId: 'cmp_002', date: '2026-09-11', status: 'LATE', checkInAt: '2026-09-11T10:15:00Z', checkOutAt: '2026-09-11T17:30:00Z', workingHours: '6h 45m' },
  ];

  findAllByCompany(companyId: string): AttendanceRecord[] {
    return this.records.filter((record) => record.companyId === companyId);
  }

  findAllByEmployee(employeeId: string): AttendanceRecord[] {
    return this.records.filter((record) => record.employeeId === employeeId);
  }
}
