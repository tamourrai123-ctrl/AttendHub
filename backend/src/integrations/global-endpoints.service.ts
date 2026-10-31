import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { paginatedResult, PaginatedResult, toSkipTake } from '../common/utils/paginate';
import { SystemLogsService } from '../system-logs/system-logs.service';
import { PrismaGlobalEndpointsRepository } from './repositories/prisma-global-endpoints.repository';
import { GlobalEndpoint, GlobalEndpointField } from './interfaces/global-endpoint.interface';
import { EndpointDirection, EndpointHttpMethod } from './interfaces/endpoint.interface';
import { CreateGlobalEndpointDto, UpdateGlobalEndpointDto } from './dto/global-endpoint.dto';
import { HrCustomService } from './services/hr-custom.service';

/** Largest set of global endpoints a company admin's dropdown ever loads at once. */
const AVAILABLE_LIMIT = 200;

export function methodFitsDirection(direction: EndpointDirection, method: string): boolean {
  return direction === 'INBOUND' ? method === 'GET' : method !== 'GET';
}

const MISSING_FIELDS_MESSAGE =
  'Add at least one AttendHub field (one per line, "field_name, Label"). Company admins pick from this list when mapping.';

function defaultMethodFor(direction: EndpointDirection): EndpointHttpMethod {
  return direction === 'INBOUND' ? 'GET' : 'POST';
}

function cleanFields(fields: { field: string; label: string }[] | undefined): GlobalEndpointField[] {
  const seen = new Set<string>();
  const out: GlobalEndpointField[] = [];
  for (const item of fields ?? []) {
    const field = item.field.trim();
    if (!field || seen.has(field)) continue;
    seen.add(field);
    out.push({ field, label: item.label.trim() || field });
  }
  return out;
}

/**
 * Super Admin defined endpoints that every Company Admin can pick in Integrations → Endpoints. A global endpoint
 * only fixes the name, direction, method, optional AttendHub field list and who may call it from the app. It
 * never carries a path or credentials: the Company Admin supplies their own path.
 */
@Injectable()
export class GlobalEndpointsService {
  constructor(
    private readonly repository: PrismaGlobalEndpointsRepository,
    private readonly systemLogsService: SystemLogsService,
  ) {}

  async list(page: number, limit: number): Promise<PaginatedResult<GlobalEndpoint>> {
    const { skip, take, page: safePage, limit: safeLimit } = toSkipTake(page, limit);
    const { items, total } = await this.repository.findPage({ skip, take });
    return paginatedResult(items, safePage, safeLimit, total);
  }

  /** What a Company Admin may choose from: active ones only. */
  async available(): Promise<GlobalEndpoint[]> {
    const { items } = await this.repository.findPage({ skip: 0, take: AVAILABLE_LIMIT, onlyActive: true });
    return items;
  }

  /** Used when a company saves an endpoint: the active global endpoint with this name, if any. */
  async findActiveByName(name: string): Promise<GlobalEndpoint | undefined> {
    const found = await this.repository.findByName(name);
    return found && found.status === 'ACTIVE' ? found : undefined;
  }

  async create(dto: CreateGlobalEndpointDto, actorName: string): Promise<GlobalEndpoint> {
    const name = dto.name.trim();
    if (!HrCustomService.isCustomName(name)) {
      throw new BadRequestException(`"${name}" is already a built-in endpoint name. Choose a different name.`);
    }
    if (await this.repository.findByName(name)) {
      throw new ConflictException(`A global endpoint named "${name}" already exists.`);
    }
    const method = dto.defaultHttpMethod ?? defaultMethodFor(dto.direction);
    if (!methodFitsDirection(dto.direction, method)) {
      throw new BadRequestException(`An ${dto.direction.toLowerCase()} endpoint cannot use ${method}.`);
    }
    const fields = cleanFields(dto.fields);
    if (fields.length === 0) throw new BadRequestException(MISSING_FIELDS_MESSAGE);
    const created = await this.repository.create({
      name,
      label: dto.label.trim(),
      description: dto.description?.trim() || undefined,
      direction: dto.direction,
      defaultHttpMethod: method,
      fields,
      callableBy: dto.callableBy ?? 'ADMIN',
      createdBy: actorName,
    });
    this.log(actorName, 'GLOBAL_ENDPOINT_CREATED', created, `Created global endpoint "${created.name}".`);
    return created;
  }

  async update(id: string, dto: UpdateGlobalEndpointDto, actorName: string): Promise<GlobalEndpoint> {
    const existing = await this.repository.findById(id);
    if (!existing) throw new NotFoundException('Global endpoint not found.');
    const direction = dto.direction ?? existing.direction;
    // Changing direction without choosing a method resets it to that direction's default.
    const method = dto.defaultHttpMethod ?? (dto.direction && dto.direction !== existing.direction ? defaultMethodFor(direction) : existing.defaultHttpMethod);
    if (!methodFitsDirection(direction, method)) {
      throw new BadRequestException(`An ${direction.toLowerCase()} endpoint cannot use ${method}.`);
    }
    // Only checked when the request sends a field list, so older endpoints without fields can still be enabled/disabled.
    const fields = dto.fields === undefined ? undefined : cleanFields(dto.fields);
    if (fields && fields.length === 0) throw new BadRequestException(MISSING_FIELDS_MESSAGE);
    const updated = await this.repository.update(id, {
      label: dto.label?.trim(),
      description: dto.description?.trim(),
      direction,
      defaultHttpMethod: method,
      fields,
      callableBy: dto.callableBy,
      status: dto.status,
    });
    if (!updated) throw new NotFoundException('Global endpoint not found.');
    this.log(actorName, 'GLOBAL_ENDPOINT_UPDATED', updated, `Updated global endpoint "${updated.name}".`);
    return updated;
  }

  /** Company endpoints already created from it keep working as ordinary custom endpoints. */
  async remove(id: string, actorName: string): Promise<void> {
    const existing = await this.repository.findById(id);
    if (!existing) throw new NotFoundException('Global endpoint not found.');
    await this.repository.remove(id);
    this.log(actorName, 'GLOBAL_ENDPOINT_DELETED', existing, `Deleted global endpoint "${existing.name}".`, 'WARNING');
  }

  private log(user: string, action: string, endpoint: GlobalEndpoint, description: string, severity?: 'WARNING'): void {
    this.systemLogsService.record({
      user,
      action,
      resource: 'Integration',
      resourceId: endpoint.id,
      ...(severity && { severity }),
      description,
      metadata: { name: endpoint.name },
    });
  }
}
