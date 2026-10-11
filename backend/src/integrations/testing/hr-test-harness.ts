import { NotFoundException } from '@nestjs/common';
import { Employee } from '../../employees/interfaces/employee.interface';
import { FieldMappingRecord } from '../interfaces/field-mapping-record.interface';
import { FieldMappingTransform } from '../interfaces/field-mapping.interface';
import { AttendancePunchService } from '../attendance-punch.service';
import { LoginSessionService } from '../login-session.service';
import { QrAttendanceService } from '../qr-attendance.service';
import { HrLookupService } from '../hr-lookup.service';
import { MobileAuthService } from '../mobile-auth.service';
import { FieldMappingService } from '../services/field-mapping.service';
import { HrLiveFetchService } from '../services/hr-live-fetch.service';
import { IntegrationEndpointExecutorService } from '../services/integration-endpoint-executor.service';

/**
 * Test-only wiring: the REAL executor, field-mapping engine, HrLiveFetchService,
 * HrLookupService, MobileAuthService and AttendancePunchService, with only the
 * database-backed pieces (repositories, employees, companies, sessions, LOV,
 * auth gateway, JWT, system logs) replaced by small in-memory stand-ins. No
 * database, no network beyond the local MockHrServer.
 */
export interface HarnessMapping {
  source: string;
  target: string;
  transform?: FieldMappingTransform;
  config?: Record<string, unknown>;
}

export interface HarnessEndpoint {
  name: string;
  httpMethod: 'GET' | 'POST';
  path: string;
  mappings: HarnessMapping[];
}

export interface HarnessCompany {
  id: string;
  shortname: string;
  integrationId: string;
  baseUrl: string;
  endpoints: HarnessEndpoint[];
}

export interface HarnessEmployee {
  id: string;
  companyId: string;
  name: string;
  externalEmployeeId: string | null;
}

export class HrTestHarness {
  readonly systemLogRecord = jest.fn();
  readonly findByExternalIdentity: jest.Mock;
  readonly executor: IntegrationEndpointExecutorService;
  readonly engine = new FieldMappingService();
  readonly lookup: HrLookupService;
  readonly mobileAuth: MobileAuthService;
  readonly punch: AttendancePunchService;
  readonly loginSession: LoginSessionService;
  readonly qrAttendance: QrAttendanceService;

  constructor(
    private readonly companies: HarnessCompany[],
    private readonly employees: HarnessEmployee[],
  ) {
    const company = (id: string) => this.companies.find((c) => c.id === id);
    const toEmployee = (e: HarnessEmployee): Employee => ({
      id: e.id,
      companyId: e.companyId,
      companyName: 'Test Co',
      name: e.name,
      email: `${e.id}@example.test`,
      phone: null,
      mobile: null,
      integrationId: e.externalEmployeeId ? company(e.companyId)?.integrationId ?? null : null,
      externalEmployeeId: e.externalEmployeeId,
    });
    const endpointRecord = (c: HarnessCompany, index: number) => ({
      id: `${c.id}-ep-${index}`,
      companyId: c.id,
      integrationId: c.integrationId,
      name: c.endpoints[index].name,
      httpMethod: c.endpoints[index].httpMethod,
      endpoint: c.endpoints[index].path,
    });

    const integrationsRepository = {
      findCredentialsForExecution: async (companyId: string, integrationId: string) => {
        const c = company(companyId);
        return c && c.integrationId === integrationId
          ? { authType: 'API_KEY', baseUrl: c.baseUrl, apiKey: 'test-key', apiSecret: 'test-secret' }
          : null;
      },
    };
    const endpointsRepository = {
      findByCompositeId: async (companyId: string, endpointId: string) => {
        const c = company(companyId);
        const index = c ? c.endpoints.findIndex((_, i) => `${c.id}-ep-${i}` === endpointId) : -1;
        return c && index >= 0 ? endpointRecord(c, index) : null;
      },
      findByIntegrationAndName: async (companyId: string, integrationId: string, name: string) => {
        const c = company(companyId);
        if (!c || c.integrationId !== integrationId) return null;
        const index = c.endpoints.findIndex((e) => e.name === name);
        return index >= 0 ? endpointRecord(c, index) : null;
      },
    };
    const fieldMappingsRepository = {
      findActiveByEndpoint: async (companyId: string, integrationId: string, endpointId: string): Promise<FieldMappingRecord[]> => {
        const c = company(companyId);
        const index = c ? c.endpoints.findIndex((_, i) => `${c.id}-ep-${i}` === endpointId) : -1;
        if (!c || index < 0 || c.integrationId !== integrationId) return [];
        return c.endpoints[index].mappings.map((m, order) => ({
          id: `${endpointId}-m-${order}`,
          companyId,
          integrationId,
          endpointId,
          sourcePath: m.source,
          targetField: m.target,
          transformType: m.transform ?? 'NONE',
          transformConfig: m.config ?? {},
          sortOrder: order,
          status: 'Y' as const,
        }));
      },
    };
    const integrationsService = {
      findMineForCompany: async (companyId: string) => {
        const c = company(companyId);
        return c ? { id: c.integrationId, status: 'CONNECTED' } : null;
      },
    };
    const lovService = { isValidValue: async () => true };
    const gatewayFactory = { create: () => ({ resolveAuthHeaders: async () => ({}) }) };
    this.findByExternalIdentity = jest.fn(async (companyId: string, _integrationId: string, externalId: string) => {
      const e = this.employees.find((x) => x.companyId === companyId && x.externalEmployeeId === externalId);
      return e ? toEmployee(e) : null;
    });
    const employeesService = {
      findSelf: async (companyId: string, id: string) => {
        const e = this.employees.find((x) => x.companyId === companyId && x.id === id);
        if (!e) throw new NotFoundException('Employee profile not found.');
        return toEmployee(e);
      },
      findByExternalIdentity: this.findByExternalIdentity,
    };
    const companiesRepository = {
      findById: async (id: string) => {
        const c = company(id);
        return c ? { id: c.id, shortname: c.shortname, name: 'Test Co' } : null;
      },
      findForMobileLoginByShortname: async (shortname: string) => {
        const c = this.companies.find((x) => x.shortname === shortname);
        return c ? { id: c.id, name: 'Test Co', status: 'ACTIVE', mobileConfig: {} } : null;
      },
    };
    const sessionsRepository = { create: jest.fn(async () => undefined) };
    const settingsService = { getSessionTimeoutSeconds: async () => 3600 };
    const jwtService = { signAsync: async () => 'test-jwt' };
    const systemLogsService = { record: this.systemLogRecord };

    this.executor = new IntegrationEndpointExecutorService(
      integrationsRepository as never,
      endpointsRepository as never,
      lovService as never,
      gatewayFactory as never,
    );
    const liveFetch = new HrLiveFetchService(
      integrationsService as never,
      endpointsRepository as never,
      fieldMappingsRepository as never,
      this.executor,
      this.engine,
    );
    this.lookup = new HrLookupService(
      liveFetch,
      companiesRepository as never,
      integrationsService as never,
      endpointsRepository as never,
      fieldMappingsRepository as never,
    );
    this.loginSession = new LoginSessionService(
      integrationsService as never,
      endpointsRepository as never,
      fieldMappingsRepository as never,
      this.engine,
      this.executor,
      systemLogsService as never,
    );
    this.qrAttendance = new QrAttendanceService(integrationsService as never, endpointsRepository as never, this.executor, systemLogsService as never);
    this.mobileAuth = new MobileAuthService(
      companiesRepository as never,
      integrationsService as never,
      endpointsRepository as never,
      fieldMappingsRepository as never,
      this.engine,
      this.executor,
      sessionsRepository as never,
      settingsService as never,
      jwtService as never,
      systemLogsService as never,
      this.loginSession,
    );
    this.punch = new AttendancePunchService(
      integrationsService as never,
      endpointsRepository as never,
      fieldMappingsRepository as never,
      this.engine,
      this.executor,
      systemLogsService as never,
    );
  }
}

/** Same mapping the admin would enter in the hub UI for one HR response field. */
export const map = (source: string, target: string, transform?: FieldMappingTransform, config?: Record<string, unknown>): HarnessMapping => ({
  source,
  target,
  transform,
  config,
});
