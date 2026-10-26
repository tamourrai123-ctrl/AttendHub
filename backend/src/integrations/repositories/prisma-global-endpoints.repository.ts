import { Injectable } from '@nestjs/common';
import { Prisma, global_endpoint as GlobalEndpointRow } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EndpointDirection, EndpointHttpMethod } from '../interfaces/endpoint.interface';
import { GlobalEndpoint, GlobalEndpointField } from '../interfaces/global-endpoint.interface';

export interface GlobalEndpointWrite {
  name?: string;
  label?: string;
  description?: string | null;
  direction?: EndpointDirection;
  defaultHttpMethod?: EndpointHttpMethod;
  fields?: GlobalEndpointField[];
  callableBy?: 'ADMIN' | 'ALL';
  status?: 'ACTIVE' | 'INACTIVE';
  createdBy?: string;
}

function toBigId(id: string): bigint | undefined {
  try {
    return BigInt(id);
  } catch {
    return undefined;
  }
}

function parseFields(value: Prisma.JsonValue): GlobalEndpointField[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is { field: string; label: string } => typeof item === 'object' && item !== null && typeof (item as { field?: unknown }).field === 'string')
    .map((item) => ({ field: item.field, label: typeof item.label === 'string' && item.label ? item.label : item.field }));
}

@Injectable()
export class PrismaGlobalEndpointsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findPage(params: { skip: number; take: number; onlyActive?: boolean }): Promise<{ items: GlobalEndpoint[]; total: number }> {
    const where: Prisma.global_endpointWhereInput = params.onlyActive ? { status: 'Y' } : {};
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.global_endpoint.findMany({ where, orderBy: [{ direction: 'asc' }, { label: 'asc' }, { id: 'asc' }], skip: params.skip, take: params.take }),
      this.prisma.global_endpoint.count({ where }),
    ]);
    return { items: rows.map((row) => this.toGlobal(row)), total };
  }

  async findById(id: string): Promise<GlobalEndpoint | undefined> {
    const key = toBigId(id);
    if (key === undefined) return undefined;
    const row = await this.prisma.global_endpoint.findUnique({ where: { id: key } });
    return row ? this.toGlobal(row) : undefined;
  }

  async findByName(name: string): Promise<GlobalEndpoint | undefined> {
    const row = await this.prisma.global_endpoint.findUnique({ where: { name } });
    return row ? this.toGlobal(row) : undefined;
  }

  async create(input: Required<Pick<GlobalEndpointWrite, 'name' | 'label' | 'direction' | 'defaultHttpMethod' | 'fields' | 'callableBy'>> & GlobalEndpointWrite): Promise<GlobalEndpoint> {
    const row = await this.prisma.global_endpoint.create({
      data: {
        name: input.name,
        label: input.label,
        description: input.description ?? null,
        direction: input.direction === 'INBOUND' ? 'I' : 'O',
        http_method: input.defaultHttpMethod,
        fields: input.fields as unknown as Prisma.InputJsonValue,
        callable_by: input.callableBy === 'ALL' ? 'E' : 'A',
        created_by: input.createdBy ?? null,
      },
    });
    return this.toGlobal(row);
  }

  async update(id: string, input: GlobalEndpointWrite): Promise<GlobalEndpoint | undefined> {
    const key = toBigId(id);
    if (key === undefined) return undefined;
    const data: Prisma.global_endpointUpdateInput = { updated_at: new Date() };
    if (input.label !== undefined) data.label = input.label;
    if (input.description !== undefined) data.description = input.description || null;
    if (input.direction !== undefined) data.direction = input.direction === 'INBOUND' ? 'I' : 'O';
    if (input.defaultHttpMethod !== undefined) data.http_method = input.defaultHttpMethod;
    if (input.fields !== undefined) data.fields = input.fields as unknown as Prisma.InputJsonValue;
    if (input.callableBy !== undefined) data.callable_by = input.callableBy === 'ALL' ? 'E' : 'A';
    if (input.status !== undefined) data.status = input.status === 'ACTIVE' ? 'Y' : 'N';
    try {
      const row = await this.prisma.global_endpoint.update({ where: { id: key }, data });
      return this.toGlobal(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') return undefined;
      throw error;
    }
  }

  async remove(id: string): Promise<boolean> {
    const key = toBigId(id);
    if (key === undefined) return false;
    const result = await this.prisma.global_endpoint.deleteMany({ where: { id: key } });
    return result.count > 0;
  }

  private toGlobal(row: GlobalEndpointRow): GlobalEndpoint {
    return {
      id: row.id.toString(),
      name: row.name,
      label: row.label,
      description: row.description,
      direction: row.direction === 'I' ? 'INBOUND' : 'OUTBOUND',
      defaultHttpMethod: row.http_method as EndpointHttpMethod,
      fields: parseFields(row.fields),
      callableBy: row.callable_by === 'E' ? 'ALL' : 'ADMIN',
      status: row.status === 'Y' ? 'ACTIVE' : 'INACTIVE',
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
}
