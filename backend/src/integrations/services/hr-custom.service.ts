import { BadGatewayException, BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '../../common/constants/roles.enum';
import { PrismaCompaniesRepository } from '../../companies/repositories/prisma-companies.repository';
import { IntegrationsService } from '../integrations.service';
import { PrismaEndpointsRepository } from '../repositories/prisma-endpoints.repository';
import { PrismaFieldMappingsRepository } from '../repositories/prisma-field-mappings.repository';
import { IntegrationEndpoint } from '../interfaces/endpoint.interface';
import { findEndpointPurposeByName } from '../constants/endpoint-purposes.constant';
import { EMPLOYEES_ENDPOINT_NAME, OAUTH2_TOKEN_ENDPOINT_NAME, ATTENDANCE_POST_ENDPOINT_NAME } from '../constants/reserved-endpoint-names.constant';
import { defaultPathParams } from '../utils/default-path-params.util';
import { hrBodyReportsFailure } from '../utils/hr-failure-body.util';
import { pathParamNames } from '../utils/path-placeholders.util';
import { FieldMappingService } from './field-mapping.service';
import { IntegrationEndpointExecutorService } from './integration-endpoint-executor.service';

const MAX_PARAM_LENGTH = 100;
/** Never accepted from a caller; identity values below are forced or restricted by role. */
const NEVER_FROM_CALLER = new Set(['password', 'shortname']);
const IDENTITY_PARAMS = new Set(['employeeId', 'name', 'username']);
const RESERVED_NAMES = new Set([EMPLOYEES_ENDPOINT_NAME, OAUTH2_TOKEN_ENDPOINT_NAME, ATTENDANCE_POST_ENDPOINT_NAME]);

export interface CustomCaller {
  companyId: string;
  role: Role;
  employeeId?: string;
  name?: string;
}

export interface CustomEndpointInfo {
  name: string;
  description: string | null;
  method: string;
  params: string[];
  callableBy: 'ADMIN' | 'ALL';
}

/**
 * Generic app-facing route for company-defined ("custom") endpoints: any endpoint whose name is not one of the
 * built-in purposes. Path placeholders are filled from the query / body, `shortname` from the company, `date`
 * defaults to today. The reply goes through the endpoint's field mappings (raw body if none are set on a GET).
 */
@Injectable()
export class HrCustomService {
  constructor(
    private readonly integrationsService: IntegrationsService,
    private readonly endpointsRepository: PrismaEndpointsRepository,
    private readonly fieldMappingsRepository: PrismaFieldMappingsRepository,
    private readonly fieldMappingEngine: FieldMappingService,
    private readonly executor: IntegrationEndpointExecutorService,
    private readonly companiesRepository: PrismaCompaniesRepository,
  ) {}

  static isCustomName(name: string): boolean {
    return !findEndpointPurposeByName(name) && !RESERVED_NAMES.has(name);
  }

  async list(caller: CustomCaller): Promise<CustomEndpointInfo[]> {
    const integration = await this.connectedIntegration(caller.companyId);
    const { endpoints } = await this.endpointsRepository.findAllByIntegration(caller.companyId, integration.id, { skip: 0, take: 200 });
    return endpoints
      .filter((endpoint) => endpoint.status === 'ACTIVE' && HrCustomService.isCustomName(endpoint.name) && this.mayCall(caller, endpoint))
      .map((endpoint) => ({
        name: endpoint.name,
        description: endpoint.description,
        method: endpoint.httpMethod,
        params: pathParamNames(endpoint.endpoint).filter((param) => param !== 'shortname' && param !== 'password'),
        callableBy: endpoint.callableBy,
      }));
  }

  async call(caller: CustomCaller, name: string, input: Record<string, unknown>, method: 'GET' | 'POST'): Promise<unknown> {
    if (!HrCustomService.isCustomName(name)) {
      throw new BadRequestException('This is a built-in endpoint. Use its own route instead of /hr/custom.');
    }
    const integration = await this.connectedIntegration(caller.companyId);
    const endpoint = await this.endpointsRepository.findByIntegrationAndName(caller.companyId, integration.id, name);
    if (!endpoint || endpoint.status !== 'ACTIVE') {
      throw new NotFoundException(`No active endpoint named "${name}" is set up for your company.`);
    }
    if (!this.mayCall(caller, endpoint)) {
      throw new ForbiddenException('This endpoint is not available for your account.');
    }
    const isGet = endpoint.httpMethod === 'GET';
    if ((method === 'GET') !== isGet) {
      throw new BadRequestException(`This endpoint is ${endpoint.httpMethod}. Call it with ${isGet ? 'GET' : 'POST'}.`);
    }

    const params = await this.buildParams(caller, endpoint, isGet ? input : (input.params as Record<string, unknown> | undefined) ?? {});
    const mappings = (await this.fieldMappingsRepository.findActiveByEndpoint(caller.companyId, integration.id, endpoint.id)).map((mapping) =>
      this.fieldMappingEngine.toDomainMapping(mapping),
    );

    if (isGet) {
      const result = await this.executor.execute(caller.companyId, integration.id, endpoint.id, params, undefined, { allPages: true });
      if (!result.success) {
        throw new BadGatewayException(result.error ?? `Your HR system answered HTTP ${result.statusCode}.`);
      }
      return mappings.length > 0 ? this.fieldMappingEngine.applyToResponse(result.body, mappings) : result.body;
    }

    if (mappings.length === 0) {
      throw new BadRequestException('This endpoint has no field mappings yet, so there is nothing to send.');
    }
    const record = (input.data && typeof input.data === 'object' && !Array.isArray(input.data) ? input.data : {}) as Record<string, unknown>;
    const body = this.fieldMappingEngine.apply(record, mappings);
    const result = await this.executor.execute(caller.companyId, integration.id, endpoint.id, params, body);
    if (!result.success || hrBodyReportsFailure(result.body)) {
      throw new BadGatewayException(result.error ?? 'Your HR system did not accept this request.');
    }
    return { delivered: true, statusCode: result.statusCode };
  }

  private mayCall(caller: CustomCaller, endpoint: IntegrationEndpoint): boolean {
    return caller.role === Role.COMPANY_ADMIN || (caller.role === Role.EMPLOYEE && endpoint.callableBy === 'ALL');
  }

  private async connectedIntegration(companyId: string) {
    const integration = await this.integrationsService.findMineForCompany(companyId);
    if (!integration || integration.status !== 'CONNECTED') {
      throw new BadRequestException('Your HR integration is not set up yet (or is currently disabled).');
    }
    return integration;
  }

  private async buildParams(caller: CustomCaller, endpoint: IntegrationEndpoint, input: Record<string, unknown>): Promise<Record<string, string>> {
    const company = await this.companiesRepository.findById(caller.companyId);
    const params: Record<string, string> = { ...defaultPathParams() };
    if (company?.shortname) params.shortname = company.shortname;

    for (const key of pathParamNames(endpoint.endpoint)) {
      if (NEVER_FROM_CALLER.has(key)) continue;
      if (IDENTITY_PARAMS.has(key) && caller.role === Role.EMPLOYEE) continue; // forced below
      const raw = input[key];
      if (raw === undefined || raw === null || raw === '') continue;
      const value = String(raw).trim();
      if (value.length > MAX_PARAM_LENGTH) {
        throw new BadRequestException(`"${key}" is too long.`);
      }
      params[key] = value;
    }

    if (caller.role === Role.EMPLOYEE) {
      if (caller.employeeId) params.employeeId = caller.employeeId;
      if (caller.name) {
        params.name = caller.name;
        params.username = caller.name;
      }
    }
    return params;
  }
}
