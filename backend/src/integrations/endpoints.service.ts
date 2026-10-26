import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { PrismaCompaniesRepository } from '../companies/repositories/prisma-companies.repository';
import { paginatedResult, PaginatedResult, toSkipTake } from '../common/utils/paginate';
import { SystemLogsService } from '../system-logs/system-logs.service';
import { PrismaIntegrationsRepository } from './repositories/prisma-integrations.repository';
import { PrismaEndpointsRepository } from './repositories/prisma-endpoints.repository';
import { PrismaFieldMappingsRepository } from './repositories/prisma-field-mappings.repository';
import { IntegrationEndpointExecutorService, ExecutionResult } from './services/integration-endpoint-executor.service';
import { ResponseFieldDetectorService, FieldDescriptor } from './services/response-field-detector.service';
import { FieldMappingService } from './services/field-mapping.service';
import { IntegrationEndpoint } from './interfaces/endpoint.interface';
import { CreateEndpointDto } from './dto/create-endpoint.dto';
import { UpdateEndpointDto } from './dto/update-endpoint.dto';
import { hrBodyReportsFailure } from './utils/hr-failure-body.util';
import { findEndpointPurposeByName } from './constants/endpoint-purposes.constant';
import { GlobalEndpointsService, methodFitsDirection } from './global-endpoints.service';
import { defaultPathParams } from './utils/default-path-params.util';

/** How many elements of an array are kept in a test response's sample body — the full array may be arbitrarily large and this is only shown for the admin to eyeball while configuring a mapping. */
const MAX_SAMPLE_ARRAY_ELEMENTS = 5;

export interface TestEndpointResult extends Omit<ExecutionResult, 'body'> {
  sampleBody?: unknown;
  detectedFields?: FieldDescriptor[];
  /**
   * Present only when this endpoint has at least one active (status='Y')
   * persisted field mapping (Phase 4F) — the real response, run through
   * FieldMappingService.applyToResponse() with those mappings, truncated
   * the same bounded way sampleBody is. Absent (not merely empty) when
   * there are no active mappings, so existing callers that only ever
   * checked sampleBody/detectedFields see no change in shape.
   */
  mappedSample?: unknown;
  /** POST test only: the body the hub built from the sample record and the active mappings and sent to HR. */
  sentBody?: unknown;
  /** True when no field mapping applied, so the typed record was sent exactly as written. */
  sentAsIs?: boolean;
}

/**
 * Endpoint (integration_detail row) CRUD, plus the sanitized test-endpoint
 * capability. Every method takes an already-resolved companyId — tenant
 * isolation (is this caller allowed to use this companyId at all) happens
 * in EndpointsController, exactly like IntegrationsService/Controller.
 *
 * Every method also confirms the parent integration_master row exists for
 * (companyId, integrationId) before touching integration_detail — an
 * endpoint can never be created/read/updated/deleted under an integration
 * that doesn't belong to that company, even if the caller somehow guessed a
 * valid integration_detail id from another tenant (defense in depth on top
 * of the composite-key scoping already enforced by the repository).
 */
@Injectable()
export class EndpointsService {
  constructor(
    private readonly repository: PrismaEndpointsRepository,
    private readonly integrationsRepository: PrismaIntegrationsRepository,
    private readonly executor: IntegrationEndpointExecutorService,
    private readonly fieldDetector: ResponseFieldDetectorService,
    private readonly fieldMappingsRepository: PrismaFieldMappingsRepository,
    private readonly fieldMappingEngine: FieldMappingService,
    private readonly systemLogsService: SystemLogsService,
    @Optional() private readonly companiesRepository?: PrismaCompaniesRepository,
    @Optional() private readonly globalEndpoints?: GlobalEndpointsService,
  ) {}

  private async assertIntegrationExists(companyId: string, integrationId: string): Promise<void> {
    const integration = await this.integrationsRepository.findByCompositeId(companyId, integrationId);
    if (!integration) {
      throw new NotFoundException('Integration not found.');
    }
  }

  async findAll(
    companyId: string,
    integrationId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedResult<IntegrationEndpoint>> {
    await this.assertIntegrationExists(companyId, integrationId);
    const { skip, take, page: safePage, limit: safeLimit } = toSkipTake(page, limit);
    const { endpoints, total } = await this.repository.findAllByIntegration(companyId, integrationId, { skip, take });
    return paginatedResult(endpoints, safePage, safeLimit, total);
  }

  async findOne(companyId: string, integrationId: string, endpointId: string): Promise<IntegrationEndpoint> {
    await this.assertIntegrationExists(companyId, integrationId);
    const endpoint = await this.repository.findByCompositeId(companyId, endpointId);
    if (!endpoint || endpoint.integrationId !== integrationId) {
      throw new NotFoundException('Endpoint not found.');
    }
    return endpoint;
  }

  /**
   * If `name` is one of the fixed purposes (see endpoint-purposes.constant.ts
   * — ATTENDANCE_FETCH/ATTENDANCE_POST/LEAVE), enforces httpMethod matches
   * that purpose's defaultHttpMethod. This is what keeps
   * IntegrationEndpoint.direction (derived purely from httpMethod) truthful
   * for these reserved names — an Inbound-purpose endpoint accidentally
   * configured as a POST would silently report as Outbound otherwise. Names
   * that don't match any known purpose are unrestricted, same as before
   * this phase.
   */
  private assertHttpMethodMatchesPurpose(name: string, httpMethod: string): void {
    const purpose = findEndpointPurposeByName(name);
    const allowedMethods: string[] = purpose ? (purpose.allowedHttpMethods ?? [purpose.defaultHttpMethod]) : [];
    if (purpose && !allowedMethods.includes(httpMethod)) {
      throw new BadRequestException(
        `The "${purpose.label}" purpose (endpoint name "${name}") must use HTTP method ${allowedMethods.join(' or ')}, not ${httpMethod}.`,
      );
    }
  }

  /**
   * A name that matches an active Super Admin global endpoint must follow its direction, and takes its
   * "who may call it" setting. Returns the callableBy to store (undefined = leave the DTO value as is).
   */
  private async applyGlobalEndpoint(name: string, httpMethod: string): Promise<'ADMIN' | 'ALL' | undefined> {
    if (findEndpointPurposeByName(name) || !this.globalEndpoints) return undefined;
    const global = await this.globalEndpoints.findActiveByName(name);
    if (!global) return undefined;
    if (!methodFitsDirection(global.direction, httpMethod)) {
      throw new BadRequestException(
        `"${global.label}" is an ${global.direction.toLowerCase()} endpoint, so it must use ${global.direction === 'INBOUND' ? 'GET' : 'POST, PUT, PATCH or DELETE'}, not ${httpMethod}.`,
      );
    }
    return global.callableBy;
  }

  async create(
    companyId: string,
    integrationId: string,
    dto: CreateEndpointDto,
    actorName: string,
  ): Promise<IntegrationEndpoint> {
    await this.assertIntegrationExists(companyId, integrationId);
    this.assertHttpMethodMatchesPurpose(dto.name, dto.httpMethod);
    const globalCallableBy = await this.applyGlobalEndpoint(dto.name, dto.httpMethod);
    const endpoint = await this.repository.create(companyId, integrationId, globalCallableBy ? { ...dto, callableBy: globalCallableBy } : dto);

    this.systemLogsService.record({
      user: actorName,
      action: 'INTEGRATION_ENDPOINT_CREATED',
      resource: 'IntegrationEndpoint',
      resourceId: endpoint.id,
      description: `Created endpoint "${endpoint.name}" under integration ${integrationId}.`,
      metadata: { integrationId, endpointId: endpoint.id, companyId },
    });

    return endpoint;
  }

  async update(
    companyId: string,
    integrationId: string,
    endpointId: string,
    dto: UpdateEndpointDto,
    actorName: string,
  ): Promise<IntegrationEndpoint> {
    const existing = await this.findOne(companyId, integrationId, endpointId); // 404s if missing or mismatched integration
    this.assertHttpMethodMatchesPurpose(dto.name ?? existing.name, dto.httpMethod ?? existing.httpMethod);
    const globalCallableBy = await this.applyGlobalEndpoint(dto.name ?? existing.name, dto.httpMethod ?? existing.httpMethod);
    const updated = await this.repository.update(companyId, endpointId, globalCallableBy ? { ...dto, callableBy: globalCallableBy } : dto);
    if (!updated) {
      throw new NotFoundException('Endpoint not found.');
    }

    this.systemLogsService.record({
      user: actorName,
      action: 'INTEGRATION_ENDPOINT_UPDATED',
      resource: 'IntegrationEndpoint',
      resourceId: updated.id,
      description: `Updated endpoint "${updated.name}" under integration ${integrationId}.`,
      metadata: { integrationId, endpointId: updated.id, companyId, changes: { ...dto } },
    });

    return updated;
  }

  /** Super Admin only (enforced in the controller): shows or hides the custom field mapping section on this endpoint for its company. */
  async setFieldMappingAccess(
    companyId: string,
    integrationId: string,
    endpointId: string,
    enabled: boolean,
    actorName: string,
  ): Promise<IntegrationEndpoint> {
    const existing = await this.findOne(companyId, integrationId, endpointId); // 404s if missing or mismatched integration
    const updated = await this.repository.setFieldMappingEnabled(companyId, endpointId, enabled);
    if (!updated) {
      throw new NotFoundException('Endpoint not found.');
    }

    this.systemLogsService.record({
      user: actorName,
      action: 'INTEGRATION_FIELD_MAPPING_ACCESS_CHANGED',
      resource: 'IntegrationEndpoint',
      resourceId: updated.id,
      description: `${enabled ? 'Enabled' : 'Disabled'} custom field mapping for endpoint "${existing.name}" under integration ${integrationId}.`,
      metadata: { integrationId, endpointId, companyId, fieldMappingEnabled: enabled },
    });

    return updated;
  }

  async remove(companyId: string, integrationId: string, endpointId: string, actorName: string): Promise<void> {
    const endpoint = await this.findOne(companyId, integrationId, endpointId); // 404s if missing or mismatched integration
    await this.repository.remove(companyId, endpointId);

    this.systemLogsService.record({
      user: actorName,
      action: 'INTEGRATION_ENDPOINT_DELETED',
      resource: 'IntegrationEndpoint',
      resourceId: endpointId,
      severity: 'WARNING',
      description: `Deleted endpoint "${endpoint.name}" under integration ${integrationId}.`,
      metadata: { integrationId, endpointId, companyId },
    });
  }

  /**
   * Sanitized test-endpoint capability: runs a real outbound call via
   * IntegrationEndpointExecutorService and returns only the outcome plus a
   * bounded sample of the response body and its detected field shape.
   * NEVER returns credentials, resolved auth headers, or the full
   * unbounded response body. Logged to system_logs the same as any other
   * endpoint action — the log entry carries the outcome/status only, never
   * the response body itself (which may contain real employee PII from the
   * external HR system).
   */
  async testEndpoint(
    companyId: string,
    integrationId: string,
    endpointId: string,
    queryParams: Record<string, string> | undefined,
    actorName: string,
    sampleRecord?: Record<string, unknown>,
  ): Promise<TestEndpointResult> {
    const endpoint = await this.findOne(companyId, integrationId, endpointId); // 404s if missing or mismatched integration

    // The company's own short name fills {{shortname}} / :p_shortname by itself, exactly like a real mobile call does.
    // `date` (and any future default) is pre-filled with today unless the tester typed one.
    const params: Record<string, string> = { ...defaultPathParams(), ...(queryParams ?? {}) };
    if (!params.shortname && this.companiesRepository) {
      const company = await this.companiesRepository.findById(companyId);
      if (company?.shortname) params.shortname = company.shortname;
    }

    // POST (Outbound): build the body from the sample record + the active mappings, then really send it.
    let sentBody: Record<string, unknown> | undefined;
    let sentAsIs = false;
    if (endpoint.httpMethod !== 'GET') {
      const purpose = findEndpointPurposeByName(endpoint.name);
      const activeMappings = await this.fieldMappingsRepository.findActiveByEndpoint(companyId, integrationId, endpointId);
      const requestFields = purpose?.requestFields?.map((field) => field.field);
      const sendMappings = activeMappings
        .map((mapping) => this.fieldMappingEngine.toDomainMapping(mapping))
        .filter((mapping) => !requestFields || requestFields.includes(mapping.sourcePath));
      const record = sampleRecord ?? {};
      if (Object.keys(record).length === 0) {
        throw new BadRequestException('Type the record to send (JSON) in the sample box first.');
      }
      if (sendMappings.length > 0 && this.fieldMappingEngine.matchesAny(record, sendMappings)) {
        // The record uses AttendHub field names: send it through the mappings.
        sentBody = this.fieldMappingEngine.apply(record, sendMappings);
      } else {
        // No mapping applies (none set, or the record is already in the HR system's own field names): send it exactly as typed.
        sentBody = record;
        sentAsIs = true;
      }
    }

    const result = await this.executor.execute(companyId, integrationId, endpointId, params, sentBody);

    this.systemLogsService.record({
      user: actorName,
      action: 'INTEGRATION_ENDPOINT_TESTED',
      resource: 'IntegrationEndpoint',
      resourceId: endpointId,
      description: `Tested endpoint under integration ${integrationId} — ${result.success ? 'succeeded' : 'failed'} (HTTP ${result.statusCode}).`,
      metadata: { integrationId, endpointId, companyId, statusCode: result.statusCode, durationMs: result.durationMs },
    });

    // A POST can come back as HTTP 200 with a body that says it failed (e.g. {"status":"FAILED", ...}): that is a failure.
    const hrRejected = endpoint.httpMethod !== 'GET' && result.success && hrBodyReportsFailure(result.body);
    const { body, ...outcome } = hrRejected ? { ...result, success: false, error: 'HR replied, but its reply says the record failed — see "HR\'s reply" below.' } : result;
    const hasBody = body !== null && body !== undefined;

    // Phase 4F integration point: if this endpoint has active persisted
    // mappings, run the real body through the same stateless engine the
    // standalone preview route uses (applyToResponse(), which internally
    // still calls apply() — no second transformation path). Absent entirely
    // when there are no active mappings, so this is purely additive to the
    // existing detection-only test-endpoint behavior.
    let mappedSample: unknown;
    if (hasBody && endpoint.httpMethod === 'GET') {
      const activeMappings = await this.fieldMappingsRepository.findActiveByEndpoint(companyId, integrationId, endpointId);
      if (activeMappings.length > 0) {
        const domainMappings = activeMappings.map((mapping) => this.fieldMappingEngine.toDomainMapping(mapping));
        mappedSample = this.truncateSample(this.fieldMappingEngine.applyToResponse(body, domainMappings));
      }
    }

    return {
      ...outcome,
      sampleBody: this.truncateSample(body),
      detectedFields: hasBody ? this.fieldDetector.detect(body) : undefined,
      mappedSample,
      sentBody,
      sentAsIs: sentBody !== undefined ? sentAsIs : undefined,
    };
  }

  private truncateSample(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.slice(0, MAX_SAMPLE_ARRAY_ELEMENTS).map((item) => this.truncateSample(item));
    }
    if (value !== null && typeof value === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        result[key] = this.truncateSample(child);
      }
      return result;
    }
    return value;
  }
}
