import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { paginatedResult, PaginatedResult, toSkipTake } from '../common/utils/paginate';
import { SystemLogsService } from '../system-logs/system-logs.service';
import { PrismaFieldMappingsRepository } from './repositories/prisma-field-mappings.repository';
import { EndpointsService } from './endpoints.service';
import { FieldMappingService } from './services/field-mapping.service';
import { FieldMappingRecord } from './interfaces/field-mapping-record.interface';
import { CreateFieldMappingDto } from './dto/create-field-mapping.dto';
import { UpdateFieldMappingDto } from './dto/update-field-mapping.dto';
import { IntegrationEndpoint } from './interfaces/endpoint.interface';
import { findEndpointPurposeByName } from './constants/endpoint-purposes.constant';

/**
 * Persistence/ownership orchestration for field mappings
 * (integration_field_mapping rows) — distinct from the stateless, singular
 * FieldMappingService (the transformation engine, unchanged in its core
 * apply()/resolvePath()/setPath() behavior). This service never applies a
 * transform itself; it only persists mapping configuration and, before any
 * write, asks the engine to validate that configuration's shape
 * (validateTransformConfig()).
 *
 * Every method takes an already-resolved companyId — tenant isolation (is
 * this caller allowed to use this companyId at all) happens in
 * FieldMappingsController, exactly like EndpointsController/EndpointsService.
 *
 * Full ownership-chain verification (company -> integration -> endpoint) is
 * done by reusing EndpointsService.findOne() as-is: it already 404s when
 * the integration doesn't belong to the company, or the endpoint doesn't
 * belong to that integration. A mapping id is then additionally checked
 * against the expected integrationId/endpointId (see findOne() below) —
 * the same "composite-key scoping plus an explicit ownership check"
 * defense-in-depth pattern used throughout this module.
 */
@Injectable()
export class FieldMappingsService {
  constructor(
    private readonly repository: PrismaFieldMappingsRepository,
    private readonly endpointsService: EndpointsService,
    private readonly fieldMappingEngine: FieldMappingService,
    private readonly systemLogsService: SystemLogsService,
  ) {}

  /** 404s if the integration doesn't belong to companyId, or the endpoint doesn't belong to that integration — the full ownership chain in one call. Returns the endpoint itself so callers that need its name/direction (create/update) don't have to fetch it twice. */
  private async assertEndpointExists(companyId: string, integrationId: string, endpointId: string): Promise<IntegrationEndpoint> {
    return this.endpointsService.findOne(companyId, integrationId, endpointId);
  }

  /**
   * If the parent endpoint's name is one of the fixed purposes (see
   * endpoint-purposes.constant.ts), restricts this mapping to that
   * purpose's fixed field list — on the side that represents "AttendHub's
   * own field", which flips with direction: for an Inbound purpose (data
   * coming FROM the HR system), that's targetField; for an Outbound
   * purpose (data going TO the HR system), it's sourcePath instead, since
   * FieldMappingService.apply() is direction-agnostic — see that class's
   * doc comment — and Phase 2/3 will call apply(ourOwnRecord, mappings) for
   * Outbound, resolving sourcePath against AttendHub's own record. The
   * other side (the HR system's own field name/path) is never restricted:
   * it varies per company's real HR system and can't be a fixed list.
   *
   * Endpoints whose name doesn't match any known purpose are unrestricted,
   * exactly like before this phase (e.g. the existing generic "EMPLOYEES"
   * endpoint, or any other custom endpoint).
   *
   * Mobile Login addition: a purpose can instead declare requestFields AND
   * responseFields (currently only EMPLOYEE_LOGIN — see
   * endpoint-purposes.constant.ts) when its single HTTP call needs mappings
   * going both ways at once. For such a purpose, `fields`/`direction` above
   * are not consulted at all — a mapping is valid if EITHER its sourcePath
   * is one of requestFields (it sends one of AttendHub's own fields to the
   * HR system) OR its targetField is one of responseFields (it reads a
   * field back out of the HR system's response). A mapping matching neither
   * is rejected, listing both fixed lists so the admin can see what's
   * actually expected either way.
   */
  private assertFieldAllowedForPurpose(endpoint: IntegrationEndpoint, sourcePath: string, targetField: string): void {
    const purpose = findEndpointPurposeByName(endpoint.name);
    if (!purpose) {
      return;
    }

    if (purpose.requestFields || purpose.responseFields) {
      const allowedRequestFields = (purpose.requestFields ?? []).map((field) => field.field);
      const allowedResponseFields = (purpose.responseFields ?? []).map((field) => field.field);
      const isRequestMapping = allowedRequestFields.includes(sourcePath);
      const isResponseMapping = allowedResponseFields.includes(targetField);

      if (!isRequestMapping && !isResponseMapping) {
        throw new BadRequestException(
          `For the "${purpose.label}" purpose, each mapping must either send one of your own fields to the HR ` +
            `system (sourcePath must be one of: ${allowedRequestFields.join(', ')}) or read one of these fields ` +
            `back from its response (targetField must be one of: ${allowedResponseFields.join(', ')}). Got ` +
            `sourcePath "${sourcePath}", targetField "${targetField}".`,
        );
      }
      return;
    }

    const ownField = purpose.direction === 'INBOUND' ? targetField : sourcePath;
    const ownFieldLabel = purpose.direction === 'INBOUND' ? 'targetField' : 'sourcePath';
    const allowed = purpose.fields.map((field) => field.field);

    if (!allowed.includes(ownField)) {
      throw new BadRequestException(
        `For the "${purpose.label}" purpose, ${ownFieldLabel} must be one of: ${allowed.join(', ')}. Got "${ownField}".`,
      );
    }
  }

  async findAll(
    companyId: string,
    integrationId: string,
    endpointId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedResult<FieldMappingRecord>> {
    await this.assertEndpointExists(companyId, integrationId, endpointId);
    const { skip, take, page: safePage, limit: safeLimit } = toSkipTake(page, limit);
    const { mappings, total } = await this.repository.findAllByEndpoint(companyId, integrationId, endpointId, { skip, take });
    return paginatedResult(mappings, safePage, safeLimit, total);
  }

  async findOne(companyId: string, integrationId: string, endpointId: string, mappingId: string): Promise<FieldMappingRecord> {
    await this.assertEndpointExists(companyId, integrationId, endpointId);
    const mapping = await this.repository.findByCompositeId(companyId, mappingId);
    if (!mapping || mapping.integrationId !== integrationId || mapping.endpointId !== endpointId) {
      throw new NotFoundException('Field mapping not found.');
    }
    return mapping;
  }

  async create(
    companyId: string,
    integrationId: string,
    endpointId: string,
    dto: CreateFieldMappingDto,
    actorName: string,
  ): Promise<FieldMappingRecord> {
    const endpoint = await this.assertEndpointExists(companyId, integrationId, endpointId);
    this.assertFieldAllowedForPurpose(endpoint, dto.sourcePath, dto.targetField);
    const transformType = dto.transformType ?? 'NONE';
    this.fieldMappingEngine.validateTransformConfig(transformType, dto.transformConfig ?? {});

    const mapping = await this.repository.create(companyId, integrationId, endpointId, { ...dto, transformType });

    this.systemLogsService.record({
      user: actorName,
      action: 'INTEGRATION_FIELD_MAPPING_CREATED',
      resource: 'FieldMapping',
      resourceId: mapping.id,
      description: `Created field mapping "${mapping.sourcePath}" -> "${mapping.targetField}" under endpoint ${endpointId}.`,
      metadata: { integrationId, endpointId, mappingId: mapping.id, companyId },
    });

    return mapping;
  }

  async update(
    companyId: string,
    integrationId: string,
    endpointId: string,
    mappingId: string,
    dto: UpdateFieldMappingDto,
    actorName: string,
  ): Promise<FieldMappingRecord> {
    const existing = await this.findOne(companyId, integrationId, endpointId, mappingId); // 404s if missing or mismatched endpoint/integration
    const endpoint = await this.assertEndpointExists(companyId, integrationId, endpointId);
    this.assertFieldAllowedForPurpose(endpoint, dto.sourcePath ?? existing.sourcePath, dto.targetField ?? existing.targetField);

    const transformType = dto.transformType ?? existing.transformType;
    const transformConfig = dto.transformConfig ?? existing.transformConfig;
    this.fieldMappingEngine.validateTransformConfig(transformType, transformConfig);

    const updated = await this.repository.update(companyId, mappingId, dto);
    if (!updated) {
      throw new NotFoundException('Field mapping not found.');
    }

    this.systemLogsService.record({
      user: actorName,
      action: 'INTEGRATION_FIELD_MAPPING_UPDATED',
      resource: 'FieldMapping',
      resourceId: updated.id,
      description: `Updated field mapping "${updated.sourcePath}" -> "${updated.targetField}" under endpoint ${endpointId}.`,
      metadata: { integrationId, endpointId, mappingId: updated.id, companyId, changes: { ...dto } },
    });

    return updated;
  }

  async remove(companyId: string, integrationId: string, endpointId: string, mappingId: string, actorName: string): Promise<void> {
    const existing = await this.findOne(companyId, integrationId, endpointId, mappingId); // 404s if missing or mismatched endpoint/integration
    await this.repository.remove(companyId, mappingId);

    this.systemLogsService.record({
      user: actorName,
      action: 'INTEGRATION_FIELD_MAPPING_DELETED',
      resource: 'FieldMapping',
      resourceId: mappingId,
      severity: 'WARNING',
      description: `Deleted field mapping "${existing.sourcePath}" -> "${existing.targetField}" under endpoint ${endpointId}.`,
      metadata: { integrationId, endpointId, mappingId, companyId },
    });
  }
}
