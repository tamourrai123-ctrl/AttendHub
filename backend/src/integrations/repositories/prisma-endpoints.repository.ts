import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, integration_detail as IntegrationDetailRow } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  EndpointHttpMethod,
  EndpointPayloadType,
  EndpointStatus,
  IntegrationEndpoint,
} from '../interfaces/endpoint.interface';
import { CreateEndpointDto } from '../dto/create-endpoint.dto';
import { UpdateEndpointDto } from '../dto/update-endpoint.dto';
import { deriveEndpointDirection } from '../constants/endpoint-purposes.constant';

// integration_detail.status is CHAR(1) — same 'Y'/'N'-only shape as
// integration_master.status (both models carry the "contains check
// constraints" schema.prisma annotation). Mapped the same way
// PrismaIntegrationsRepository maps integration_master.status.
const STATUS_TO_CODE: Record<EndpointStatus, string> = { ACTIVE: 'Y', INACTIVE: 'N' };
const CODE_TO_STATUS: Record<string, EndpointStatus> = { Y: 'ACTIVE', N: 'INACTIVE' };

function toStatusCode(status: EndpointStatus): string {
  return STATUS_TO_CODE[status];
}

function fromStatusCode(code: string): EndpointStatus {
  return CODE_TO_STATUS[code] ?? 'INACTIVE';
}

function toBigIntId(id: string, field: string): bigint {
  try {
    return BigInt(id);
  } catch {
    throw new BadRequestException(`${field} must be a valid integer.`);
  }
}

/**
 * integration_detail's real primary key is composite: (company_id, id) —
 * same Prisma combined-field naming as integration_master
 * (`company_id_id`, confirmed by that repository's own successful build).
 * Every lookup/update/delete here is additionally checked against the
 * expected integration_id at the service layer (EndpointsService), so an
 * id that exists but belongs to a different integration is treated as not
 * found rather than silently operated on.
 */
@Injectable()
export class PrismaEndpointsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAllByIntegration(
    companyId: string,
    integrationId: string,
    params: { skip: number; take: number },
  ): Promise<{ endpoints: IntegrationEndpoint[]; total: number }> {
    const where: Prisma.integration_detailWhereInput = {
      company_id: companyId,
      integration_id: toBigIntId(integrationId, 'integrationId'),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.integration_detail.findMany({
        where,
        orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
        skip: params.skip,
        take: params.take,
      }),
      this.prisma.integration_detail.count({ where }),
    ]);

    return { endpoints: rows.map((row) => this.toEndpoint(row)), total };
  }

  /** Looks up by (company_id, id) only — callers must separately confirm integration_id matches what the route expects. */
  async findByCompositeId(companyId: string, id: string): Promise<IntegrationEndpoint | undefined> {
    const row = await this.prisma.integration_detail.findUnique({
      where: { company_id_id: { company_id: companyId, id: toBigIntId(id, 'id') } },
    });
    return row ? this.toEndpoint(row) : undefined;
  }

  /**
   * Used only by IntegrationEndpointExecutorService to resolve an OAuth2
   * integration's token endpoint — see
   * constants/reserved-endpoint-names.constant.ts. `name` has no unique
   * constraint in the schema, so this takes the first match ordered by id;
   * a company/integration that configures more than one row with the
   * reserved name has a configuration error, not something this method
   * silently resolves.
   */
  async findByIntegrationAndName(
    companyId: string,
    integrationId: string,
    name: string,
  ): Promise<IntegrationEndpoint | undefined> {
    const row = await this.prisma.integration_detail.findFirst({
      where: { company_id: companyId, integration_id: toBigIntId(integrationId, 'integrationId'), name },
      orderBy: { id: 'asc' },
    });
    return row ? this.toEndpoint(row) : undefined;
  }

  /**
   * Cross-tenant lookup used only by the background Employee Sync scheduler
   * (EmployeeSyncSchedulerService) to enumerate every (company_id,
   * integration_id) pair that has an active endpoint named `name` (in
   * practice, always EMPLOYEES_ENDPOINT_NAME) under an active integration.
   * Unlike every other method on this repository, this is deliberately NOT
   * scoped to a single companyId — the scheduler has no calling company of
   * its own, it needs to discover every company that has this configured.
   * `integration_master` is the confirmed Prisma relation name from
   * integration_detail to its parent row (see schema.prisma).
   */
  async findActiveEmployeesEndpoints(name: string): Promise<{ companyId: string; integrationId: string }[]> {
    const rows = await this.prisma.integration_detail.findMany({
      where: {
        name,
        status: 'Y',
        integration_master: { status: 'Y' },
      },
      select: { company_id: true, integration_id: true },
    });

    return rows.map((row) => ({ companyId: row.company_id, integrationId: row.integration_id.toString() }));
  }

  async create(companyId: string, integrationId: string, dto: CreateEndpointDto): Promise<IntegrationEndpoint> {
    const now = new Date();
    try {
      const row = await this.prisma.integration_detail.create({
        data: {
          company_id: companyId,
          integration_id: toBigIntId(integrationId, 'integrationId'),
          name: dto.name,
          description: dto.description,
          endpoint: dto.endpoint,
          http_method: dto.httpMethod,
          request_type: dto.requestType,
          response_type: dto.responseType,
          sort_order: dto.sortOrder ?? 1,
          callable_by: dto.callableBy === 'ALL' ? 'E' : 'A',
          add_date: now,
          edit_date: now,
          // status intentionally omitted — integration_detail.status
          // defaults to 'Y' (ACTIVE) at the database level.
        },
      });
      return this.toEndpoint(row);
    } catch (error) {
      this.handleWriteError(error);
    }
  }

  async update(companyId: string, id: string, dto: UpdateEndpointDto): Promise<IntegrationEndpoint | undefined> {
    try {
      const row = await this.prisma.integration_detail.update({
        where: { company_id_id: { company_id: companyId, id: toBigIntId(id, 'id') } },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.description !== undefined && { description: dto.description }),
          ...(dto.endpoint !== undefined && { endpoint: dto.endpoint }),
          ...(dto.httpMethod !== undefined && { http_method: dto.httpMethod }),
          ...(dto.requestType !== undefined && { request_type: dto.requestType }),
          ...(dto.responseType !== undefined && { response_type: dto.responseType }),
          ...(dto.sortOrder !== undefined && { sort_order: dto.sortOrder }),
          ...(dto.callableBy !== undefined && { callable_by: dto.callableBy === 'ALL' ? 'E' : 'A' }),
          ...(dto.status !== undefined && { status: toStatusCode(dto.status) }),
          edit_date: new Date(),
        },
      });
      return this.toEndpoint(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return undefined;
      }
      this.handleWriteError(error);
    }
  }

  /** Super Admin switch: shows ('Y') or hides ('N') the custom field mapping section for the Company Admin on this endpoint. */
  async setFieldMappingEnabled(companyId: string, id: string, enabled: boolean): Promise<IntegrationEndpoint | undefined> {
    try {
      const row = await this.prisma.integration_detail.update({
        where: { company_id_id: { company_id: companyId, id: toBigIntId(id, 'id') } },
        data: { field_mapping_enabled: enabled ? 'Y' : 'N', edit_date: new Date() },
      });
      return this.toEndpoint(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return undefined;
      }
      this.handleWriteError(error);
    }
  }

  async remove(companyId: string, id: string): Promise<boolean> {
    try {
      const endpointId = toBigIntId(id, 'id');
      // The mappings reference the endpoint (FK, no cascade), so they must go first or the delete is refused.
      await this.prisma.$transaction([
        this.prisma.integration_field_mapping.deleteMany({ where: { company_id: companyId, endpoint_id: endpointId } }),
        this.prisma.integration_detail.delete({ where: { company_id_id: { company_id: companyId, id: endpointId } } }),
      ]);
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return false;
      }
      this.handleWriteError(error);
    }
  }

  private toEndpoint(row: IntegrationDetailRow): IntegrationEndpoint {
    const httpMethod = row.http_method as EndpointHttpMethod;
    return {
      id: row.id.toString(),
      companyId: row.company_id,
      integrationId: row.integration_id.toString(),
      name: row.name,
      description: row.description ?? null,
      endpoint: row.endpoint,
      httpMethod,
      direction: deriveEndpointDirection(httpMethod),
      requestType: row.request_type as EndpointPayloadType,
      responseType: row.response_type as EndpointPayloadType,
      sortOrder: row.sort_order,
      status: fromStatusCode(row.status),
      fieldMappingEnabled: row.field_mapping_enabled === 'Y',
      callableBy: row.callable_by === 'E' ? 'ALL' : 'ADMIN',
    };
  }

  private handleWriteError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2003') {
        throw new ConflictException('integrationId does not refer to an existing integration for this company.');
      }
      if (error.code === 'P2025') {
        throw new NotFoundException('Endpoint not found.');
      }
    }
    throw error;
  }
}
