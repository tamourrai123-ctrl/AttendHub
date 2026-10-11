import { Injectable } from '@nestjs/common';
import { LeaveRecord } from '../interfaces/leave-record.interface';

/**
 * InMemoryLeaveRepository — NOT wired into LeaveModule anymore (see its doc
 * comment): the request/approval model this seed data originally supported
 * was replaced by the live balance-summary model (see LeaveRecord's doc
 * comment). Left on disk, unused, for reference, same convention as
 * InMemoryCompaniesRepository — but its seed data is kept in sync with
 * LeaveRecord's current shape so this file still compiles as part of the
 * project even though nothing calls it.
 */
@Injectable()
export class InMemoryLeaveRepository {
  private readonly records: LeaveRecord[] = [
    { id: 'lv_001', employeeId: 'emp_004', employeeName: 'Sara Malik', companyId: 'cmp_001', leaveType: 'Sick Leave', totalLeaveDays: 10, entitledLeave: 10, consumedLeave: 3, availableLeaveBalance: 7, leaveStatus: 'Active' },
    { id: 'lv_002', employeeId: 'emp_003', employeeName: 'Ahmed Raza', companyId: 'cmp_001', leaveType: 'Casual Leave', totalLeaveDays: 8, entitledLeave: 8, consumedLeave: 2, availableLeaveBalance: 6, leaveStatus: 'Active' },
    { id: 'lv_003', employeeId: 'emp_002', employeeName: 'Fatima Noor', companyId: 'cmp_001', leaveType: 'Annual Leave', totalLeaveDays: 14, entitledLeave: 14, consumedLeave: 5, availableLeaveBalance: 9, leaveStatus: 'Active' },
    { id: 'lv_004', employeeId: 'emp_001', employeeName: 'John Carter', companyId: 'cmp_001', leaveType: 'Casual Leave', totalLeaveDays: 8, entitledLeave: 8, consumedLeave: 1, availableLeaveBalance: 7, leaveStatus: 'Active' },
    { id: 'lv_005', employeeId: 'emp_007', employeeName: 'Hamza Iqbal', companyId: 'cmp_001', leaveType: 'Sick Leave', totalLeaveDays: 10, entitledLeave: 10, consumedLeave: 6, availableLeaveBalance: 4, leaveStatus: 'Active' },

    // cmp_002 — must never appear for a cmp_001 Company Admin.
    { id: 'lv_101', employeeId: 'emp_101', employeeName: 'Nida Farooq', companyId: 'cmp_002', leaveType: 'Annual Leave', totalLeaveDays: 14, entitledLeave: 14, consumedLeave: 3, availableLeaveBalance: 11, leaveStatus: 'Active' },
  ];

  findAllByCompany(companyId: string): LeaveRecord[] {
    return this.records.filter((record) => record.companyId === companyId);
  }
}
