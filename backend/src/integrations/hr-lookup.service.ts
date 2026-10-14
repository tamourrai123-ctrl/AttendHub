import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaCompaniesRepository } from '../companies/repositories/prisma-companies.repository';
import { IntegrationsService } from './integrations.service';
import { PrismaEndpointsRepository } from './repositories/prisma-endpoints.repository';
import { PrismaFieldMappingsRepository } from './repositories/prisma-field-mappings.repository';
import { HrLiveFetchService } from './services/hr-live-fetch.service';
import { nameFromStatelessUserKey } from './utils/stateless-session.util';
import {
  ATTENDANCE_FETCH_ENDPOINT_NAME,
  ANNOUNCEMENTS_ENDPOINT_NAME,
  ATTENDANCE_PUNCHES_ENDPOINT_NAME,
  COMPANY_INFO_ENDPOINT_NAME,
  DEVICE_INFO_ENDPOINT_NAME,
  HOLIDAYS_ENDPOINT_NAME,
  LEAVE_ENDPOINT_NAME,
  SHIFT_RECORD_ENDPOINT_NAME,
  WIFI_INFO_ENDPOINT_NAME,
} from './constants/reserved-endpoint-names.constant';

/**
 * Live, read-only lookups the mobile app needs from the company's HR system
 * (shift, wifi, company info). Pure pass-through: nothing is stored, and
 * nothing here is logged — no values, no resolved paths.
 *
 * Delegates the whole "find the company's integration + purpose endpoint,
 * call it, apply the admin's field mapping" job to the existing
 * HrLiveFetchService; this class only decides which values fill the path
 * placeholders, and where each one comes from:
 *   - {{shortname}}  <- the caller's own company (usm_company.shortname)
 *   - {{employeeId}} <- the caller's own linked HR id (Employee.externalEmployeeId)
 *   - {{wifiName}}   <- the request body (POST /api/hr/wifi)
 * companyId/employeeId always come from the session, never from the client,
 * so a caller can only reach their own company's data. The executor URL-encodes
 * every placeholder value (names with spaces are safe).
 *
 * Every method returns an array of mapped records (possibly empty).
 */
@Injectable()
export class HrLookupService {
  constructor(
    private readonly hrLiveFetch: HrLiveFetchService,
    private readonly companiesRepository: PrismaCompaniesRepository,
    private readonly integrationsService: IntegrationsService,
    private readonly endpointsRepository: PrismaEndpointsRepository,
    private readonly fieldMappingsRepository: PrismaFieldMappingsRepository,
  ) {}

  async getCompanyInfo(companyId: string): Promise<Record<string, unknown>[]> {
    return this.fetch(companyId, COMPANY_INFO_ENDPOINT_NAME, {});
  }

  async getShift(companyId: string, employeeId: string): Promise<Record<string, unknown>[]> {
    return this.fetch(companyId, SHIFT_RECORD_ENDPOINT_NAME, { employeeId });
  }

  /**
   * The caller's OWN leave report. Reuses the company's existing LEAVE
   * endpoint + field mapping (no new purpose): its path is expected to use
   * {{shortname}} and {{employeeId}}. Returns the mapped rows as-is — HR's
   * leave rows carry no employee code, which is fine here because the
   * employee comes from the session.
   */
  async getLeave(companyId: string, employeeId: string): Promise<Record<string, unknown>[]> {
    return this.fetch(companyId, LEAVE_ENDPOINT_NAME, { employeeId });
  }

  /**
   * The caller's raw punch rows (one per punch, no grouping into days — the
   * app does that). HR's report path takes the employee NAME, so {{name}} is
   * the HR display name carried by the session (read from HR's own login
   * response, never stored); it must match HR's spelling or HR returns nothing.
   */
  async getAttendancePunches(companyId: string, employeeId: string, sessionUserId?: string): Promise<Record<string, unknown>[]> {
    const name = nameFromStatelessUserKey(sessionUserId);
    if (!name) {
      throw new BadRequestException(
        'Your HR login did not return a name, which the HR attendance report needs — ask your admin to map "name" on the Employee Login endpoint.',
      );
    }
    // The HR document's "Mobile Attendance Report" is the ATTENDANCE_FETCH purpose. An older setup that was built on the
    // (now hidden) ATTENDANCE_PUNCHES purpose keeps working: it is used only when no ATTENDANCE_FETCH endpoint exists.
    try {
      return await this.fetch(companyId, ATTENDANCE_FETCH_ENDPOINT_NAME, { name });
    } catch (error) {
      if (error instanceof BadRequestException && String(error.message).includes(`No "${ATTENDANCE_FETCH_ENDPOINT_NAME}" endpoint`)) {
        return this.fetch(companyId, ATTENDANCE_PUNCHES_ENDPOINT_NAME, { name });
      }
      throw error;
    }
  }

  /** The company's holiday list, live from HR (uses the company's HOLIDAYS endpoint mapping). */
  async getHolidays(companyId: string, employeeId?: string): Promise<Record<string, unknown>[]> {
    return this.fetch(companyId, HOLIDAYS_ENDPOINT_NAME, employeeId ? { employeeId } : {});
  }

  /** The company's announcements, live from HR (uses the company's ANNOUNCEMENTS endpoint mapping). */
  async getAnnouncements(companyId: string, employeeId?: string): Promise<Record<string, unknown>[]> {
    return this.fetch(companyId, ANNOUNCEMENTS_ENDPOINT_NAME, employeeId ? { employeeId } : {});
  }

  async getWifi(companyId: string, wifiName: string): Promise<Record<string, unknown>[]> {
    return this.fetch(companyId, WIFI_INFO_ENDPOINT_NAME, { wifiName });
  }

  /**
   * Company Admin only (enforced by the controller). `username` is the HR
   * login name of the user whose device record is wanted (sent in the POST
   * body). Access/refresh tokens are returned only if the admin mapped them,
   * only to the Company Admin, and are never logged or stored here — only
   * mapped values are ever returned, never the raw HR body.
   */
  async getDeviceInfo(companyId: string, username: string): Promise<Record<string, unknown>[]> {
    return this.fetch(companyId, DEVICE_INFO_ENDPOINT_NAME, { username });
  }

  private async fetch(companyId: string, purposeName: string, params: Record<string, string>): Promise<Record<string, unknown>[]> {
    const shortname = await this.resolveShortname(companyId);
    const { records } = await this.hrLiveFetch.fetchMapped(companyId, purposeName, { shortname, ...params });
    return records;
  }

  private async resolveShortname(companyId: string): Promise<string> {
    const company = await this.companiesRepository.findById(companyId);
    if (!company?.shortname) {
      throw new BadRequestException('Your company has no short name configured.');
    }
    return company.shortname;
  }
}
