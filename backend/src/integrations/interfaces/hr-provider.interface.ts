/**
 * HR Integration Provider abstraction.
 *
 * AttendHub does not implement any specific HR vendor's API in this
 * phase. Instead, every HR integration (e.g. a specific payroll or HR
 * platform) must be implemented as a class that satisfies this
 * `HRProvider` interface. This keeps attendance/leave/employee sync
 * logic decoupled from any single vendor, so a new HR system can be
 * added later by writing one new adapter class — nothing else in the
 * codebase should need to change.
 *
 * No concrete implementation of this interface exists yet. Adding one
 * requires documenting exactly which vendor/API it targets, its auth
 * method, and its rate limits before any real network calls are wired
 * in.
 */

export interface HRProviderEmployee {
  externalId: string;
  fullName: string;
  email: string;
  department?: string;
  jobTitle?: string;
}

export interface HRProviderAttendanceRecord {
  externalEmployeeId: string;
  date: string;
  checkIn?: string;
  checkOut?: string;
}

export interface HRProviderLeaveRecord {
  externalEmployeeId: string;
  type: string;
  startDate: string;
  endDate: string;
  status: string;
}

export interface HRProvider {
  getEmployees(): Promise<HRProviderEmployee[]>;
  getAttendance(
    startDate: string,
    endDate: string,
  ): Promise<HRProviderAttendanceRecord[]>;
  getLeave(
    startDate: string,
    endDate: string,
  ): Promise<HRProviderLeaveRecord[]>;
}
