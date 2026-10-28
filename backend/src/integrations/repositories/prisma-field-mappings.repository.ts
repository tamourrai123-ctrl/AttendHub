import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, integration_field_mapping as IntegrationFieldMappingRow } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { FieldMappingTransform } from '../interfaces/field-mapping.interface';
import { FieldMappingRecord } from '../interfaces/field-mapping-record.interface';
import { CreateFieldMappingDto } from '../dto/create-field-mapping.dto';
import { UpdateFieldMappingDto } from '../dto/update-field-mapping.dto';

function toBigIntId(id: string, field: string): bigint {
  try {
    return BigInt(id);
  } catch {
    throw new BadRequestException(`${field} must be a valid integer.`);
  }
}

/**
 * integration_field_mapping's real primary key is composite: (company_id,
 * id) — same Prisma combined-field naming (`company_id_id`) already
 * confirmed working for integration_master/integration_detail. Every
 * lookup/update/delete here is additionally checked against the expected
 * integration_id/endpoint_id at the service layer (FieldMappingsService),
 * so a mapping id that exists but belongs to a different endpoint/
 * integration/company is treated as not found rather than silently
 * operated on — the same "composite-key scoping plus an explicit ownership
 * check" pattern PrismaEndpointsRepository/EndpointsService already use.
 *
 * transform_type/transform_config/status are stored and returned exactly as
 * given — this repository does no interpretation of them (that's
 * FieldMappingService's job as the single transformation engine). status
 * follows the plain 'Y'/'N' convention directly, unlike EndpointStatus's
 * ACTIVE/INACTIVE mapping, per Phase 4F's explicit instruction to reuse the
 * existing Y/N vocabulary here rather than invent a new one.
 */
@Injectable()
export class PrismaFieldMappingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Active (status 'Y') mapping count per endpoint id for one integration, in ONE query. */
  async countActiveByIntegration(companyId: string, integrationId: string): Promise<Record<string, number>> {
    const rows = await this.prisma.integration_field_mapping.groupBy({
      by: ['endpoint_id'],
      where: { company_id: companyId, integration_id: toBigIntId(integrationId, 'integrationId'), status: 'Y' },
      _count: { _all: true },
    });
    return Object.fromEntries(rows.map((row) => [row.endpoint_id.toString(), row._count._all]));
  }

  async findAllByEndpoint(
    companyId: string,
    integrationId: string,
    endpointId: string,
    params: { skip: number; take: number },
  ): Promise<{ mappings: FieldMappingRecord[]; total: number }> {
    const where: Prisma.integration_field_mappingWhereInput = {
      company_id: companyId,
      integration_id: toBigIntId(integrationId, 'integrationId'),
      endpoint_id: toBigIntId(endpointId, 'endpointId'),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.integration_field_mapping.findMany({
        where,
        orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
        skip: params.skip,
        take: params.take,
      }),
      this.prisma.integration_field_mapping.count({ where }),
    ]);

    return { mappings: rows.map((row) => this.toRecord(row)), total };
  }

  /**
   * Unpaginated — status='Y' only, ordered by sort_order. Used solely by
   * EndpointsService.testEndpoint() to build the mapped-sample preview
   * against a live response; a mapping set for one endpoint is expected to
   * stay small (it configures a handful of fields, not a data table), so
   * pagination here would be over-engineering for the one real caller.
   */
  async findActiveByEndpoint(companyId: string, integrationId: string, endpointId: string): Promise<FieldMappingRecord[]> {
    const rows = await this.prisma.integration_field_mapping.findMany({
      where: {
        company_id: companyId,
        integration_id: toBigIntId(integrationId, 'integrationId'),
        endpoint_id: toBigIntId(endpointId, 'endpointId'),
        status: 'Y',
      },
      orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => this.toRecord(row));
  }

  /** Looks up by (company_id, id) only — callers must separately confirm integration_id/endpoint_id match what the route expects. */
  async findByCompositeId(companyId: string, id: string): Promise<FieldMappingRecord | undefined> {
    const row = await this.prisma.integration_field_mapping.findUnique({
      where: { company_id_id: { company_id: companyId, id: toBigIntId(id, 'id') } },
    });
    return row ? this.toRecord(row) : undefined;
  }

  async create(
    companyId: string,
    integrationId: string,
    endpointId: string,
    dto: CreateFieldMappingDto & { transformType: FieldMappingTransform },
  ): Promise<FieldMappingRecord> {
    const now = new Date();
    try {
      const row = await this.prisma.integration_field_mapping.create({
        data: {
          company_id: companyId,
          integration_id: toBigIntId(integrationId, 'integrationId'),
          endpoint_id: toBigIntId(endpointId, 'endpointId'),
          source_path: dto.sourcePath,
          target_field: dto.targetField,
          transform_type: dto.transformType,
          transform_config: (dto.transformConfig ?? {}) as Prisma.InputJsonValue,
          sort_order: dto.sortOrder ?? 1,
          add_date: now,
          edit_date: now,
          // status intentionally omitted when not supplied — the database
          // column defaults to 'Y', same convention as integration_detail.
          ...(dto.status !== undefined && { status: dto.status }),
        },
      });
      return this.toRecord(row);
    } catch (error) {
      this.handleWriteError(error);
    }
  }

  async update(companyId: string, id: string, dto: UpdateFieldMappingDto): Promise<FieldMappingRecord | undefined> {
    try {
      const row = await this.prisma.integration_field_mapping.update({
        where: { company_id_id: { company_id: companyId, id: toBigIntId(id, 'id') } },
        data: {
          ...(dto.sourcePath !== undefined && { source_path: dto.sourcePath }),
          ...(dto.targetField !== undefined && { target_field: dto.targetField }),
          ...(dto.transformType !== undefined && { transform_type: dto.transformType }),
          ...(dto.transformConfig !== undefined && { transform_config: dto.transformConfig as Prisma.InputJsonValue }),
          ...(dto.sortOrder !== undefined && { sort_order: dto.sortOrder }),
          ...(dto.status !== undefined && { status: dto.status }),
          edit_date: new Date(),
        },
      });
      return this.toRecord(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return undefined;
      }
      this.handleWriteError(error);
    }
  }

  async remove(companyId: string, id: string): Promise<boolean> {
    try {
      await this.prisma.integration_field_mapping.delete({
        where: { company_id_id: { company_id: companyId, id: toBigIntId(id, 'id') } },
      });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return false;
      }
      this.handleWriteError(error);
    }
  }

  private toRecord(row: IntegrationFieldMappingRow): FieldMappingRecord {
    return {
      id: row.id.toString(),
      companyId: row.company_id,
      integrationId: row.integration_id.toString(),
      endpointId: row.endpoint_id.toString(),
      sourcePath: row.source_path,
      targetField: row.target_field,
      transformType: row.transform_type as FieldMappingTransform,
      transformConfig: (row.transform_config ?? {}) as Record<string, unknown>,
      sortOrder: row.sort_order,
      status: row.status as 'Y' | 'N',
    };
  }

  private handleWriteError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        throw new ConflictException('A mapping with this sourcePath and targetField already exists for this endpoint.');
      }
      if (error.code === 'P2003') {
        throw new ConflictException('endpointId does not refer to an existing endpoint for this integration/company.');
      }
      if (error.code === 'P2025') {
        throw new NotFoundException('Field mapping not found.');
      }
    }
    throw error;
  }
}
