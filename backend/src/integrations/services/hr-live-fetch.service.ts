import { BadRequestException, Injectable } from '@nestjs/common';
import { IntegrationsService } from '../integrations.service';
import { PrismaEndpointsRepository } from '../repositories/prisma-endpoints.repository';
import { PrismaFieldMappingsRepository } from '../repositories/prisma-field-mappings.repository';
import { IntegrationEndpointExecutorService } from './integration-endpoint-executor.service';
import { FieldMappingService } from './field-mapping.service';

export interface HrLiveFetchResult {
  integrationId: string;
  records: Record<string, unknown>[];
}

/**
 * Phase 2/Part C — the shared "resolve a company's own integration, find
 * the endpoint serving a given fixed purpose (see
 * constants/endpoint-purposes.constant.ts), and fetch+map it live" helper.
 * Used by AttendanceService and LeaveService, both of which only ever know
 * a companyId (never an integrationId) — unlike HrEmployeesService, which
 * already receives integrationId directly (nested under
 * /integrations/:integrationId/hr-employees) and keeps its own copy of this
 * same fetch+map logic. Kept as a separate class rather than refactoring
 * HrEmployeesService to share it, to avoid touching already-working code
 * for a purely additive phase.
 *
 * Reuses the exact same two building blocks every other live call in this
 * module uses — IntegrationEndpointExecutorService (makes the real call)
 * and FieldMappingService (shapes the response) — so there is still only
 * ever one way a mapping gets applied and one way a call goes out.
 *
 * Never persists or caches anything: every call is a fresh live fetch.
 */
@Injectable()
export class HrLiveFetchService {
  constructor(
    private readonly integrationsService: IntegrationsService,
    private readonly endpointsRepository: PrismaEndpointsRepository,
    private readonly fieldMappingsRepository: PrismaFieldMappingsRepository,
    private readonly executor: IntegrationEndpointExecutorService,
    private readonly fieldMappingEngine: FieldMappingService,
  ) {}

  async fetchMapped(
    companyId: string,
    purposeEndpointName: string,
    queryParams: Record<string, string> = {},
  ): Promise<HrLiveFetchResult> {
    const integration = await this.integrationsService.findMineForCompany(companyId);
    if (!integration || integration.status !== 'CONNECTED') {
      throw new BadRequestException('Your HR integration is not set up yet (or is currently disabled).');
    }

    const endpoint = await this.endpointsRepository.findByIntegrationAndName(companyId, integration.id, purposeEndpointName);
    if (!endpoint) {
      throw new BadRequestException(`No "${purposeEndpointName}" endpoint is configured for your integration yet.`);
    }

    const mappings = await this.fieldMappingsRepository.findActiveByEndpoint(companyId, integration.id, endpoint.id);
    if (mappings.length === 0) {
      throw new BadRequestException(`The "${purposeEndpointName}" endpoint has no active field mappings configured yet.`);
    }

    const result = await this.executor.execute(companyId, integration.id, endpoint.id, queryParams, undefined, { allPages: true });
    if (!result.success) {
      throw new BadRequestException(result.error ?? `The HR system returned an unsuccessful response (HTTP ${result.statusCode}).`);
    }

    const domainMappings = mappings.map((mapping) => this.fieldMappingEngine.toDomainMapping(mapping));
    const applied = this.fieldMappingEngine.applyToResponse(result.body, domainMappings);
    const records = Array.isArray(applied) ? (applied as Record<string, unknown>[]) : [applied as Record<string, unknown>];

    return { integrationId: integration.id, records };
  }
}
