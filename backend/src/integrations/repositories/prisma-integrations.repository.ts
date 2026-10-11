import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { Integration, IntegrationStatus } from '../interfaces/integration.interface';
import { CreateIntegrationDto } from '../dto/create-integration.dto';
import { UpdateIntegrationDto } from '../dto/update-integration.dto';

// integration_master.status is CHAR(1) with a real CHECK constraint
// (status IN ('Y','N')) — confirmed via pg_get_constraintdef, unlike
// usm_company.status which has no such constraint. Only these two values
// can ever be stored; there is no room for a third state here.
const STATUS_TO_CODE: Record<IntegrationStatus, string> = { CONNECTED: 'Y', DISCONNECTED: 'N' };
const CODE_TO_STATUS: Record<string, IntegrationStatus> = { Y: 'CONNECTED', N: 'DISCONNECTED' };

function toStatusCode(status: IntegrationStatus): string {
  return STATUS_TO_CODE[status];
}

function fromStatusCode(code: string): IntegrationStatus {
  // Defensive fallback only — every value this app writes is Y or N, and
  // the database itself rejects anything else.
  return CODE_TO_STATUS[code] ?? 'DISCONNECTED';
}

/**
 * integration_master's primary key is composite: (company_id, id). Prisma
 * generates a combined-field name for a `@@id([...])` with no explicit
 * `name` argument by joining the field names with `_` — for
 * `@@id([company_id, id])` that is `company_id_id`, confirmed via a
 * successful `nest build`.
 */
function toBigIntId(id: string): bigint {
  try {
    return BigInt(id);
  } catch {
    throw new BadRequestException('id must be a valid integer.');
  }
}

/**
 * Included on every integration_master read so companyName is derived from
 * a single query (a JOIN via the existing usm_company relation) instead of
 * a separate per-row usm_company lookup — see the Prisma repository audit
 * report's N+1 findings.
 */
const INTEGRATION_INCLUDE = { usm_company: true };

type IntegrationRow = Prisma.integration_masterGetPayload<{ include: { usm_company: true } }>;

/**
 * PrismaIntegrationsRepository — reads/writes the real `integration_master`
 * table. Replaces InMemoryIntegrationsRepository for this module only (see
 * integrations.module.ts); that file is left on disk, unused, the same way
 * InMemoryCompaniesRepository was left after the Companies migration.
 *
 * Every lookup, update, and delete goes through the composite
 * (companyId, id) key — id alone is never assumed unique. Tenant-isolation
 * enforcement (who is allowed to ask for which companyId) lives in
 * IntegrationsController, not here; this repository trusts whatever
 * companyId it's given.
 *
 * findAll() paginates at the database level (skip/take + a separate
 * count()) — previously this had no pagination at all, not even the
 * in-memory kind Companies/Employees had; see the Prisma repository audit
 * report.
 */
@Injectable()
export class PrismaIntegrationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(params: { skip: number; take: number }): Promise<{ integrations: Integration[]; total: number }> {
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.integration_master.findMany({
        orderBy: [{ company_id: 'asc' }, { id: 'asc' }],
        include: INTEGRATION_INCLUDE,
        skip: params.skip,
        take: params.take,
      }),
      this.prisma.integration_master.count(),
    ]);

    return { integrations: rows.map((row) => this.toIntegration(row)), total };
  }

  /**
   * INTERNAL USE ONLY — for IntegrationEndpointExecutorService. Returns the
   * raw auth_type/base_url/api_key/api_secret needed to actually make an
   * outbound call. Deliberately a separate method from findByCompositeId(),
   * which goes through toIntegration() and can never return credentials —
   * this keeps "credentials never cross the API boundary" true by
   * construction (no shared code path a future change could accidentally
   * widen) rather than by convention alone. Callers must never log, return,
   * or include this method's result in any response/error.
   */
  async findCredentialsForExecution(
    companyId: string,
    id: string,
  ): Promise<{ authType: string | null; baseUrl: string; apiKey: string; apiSecret: string } | undefined> {
    const row = await this.prisma.integration_master.findUnique({
      where: { company_id_id: { company_id: companyId, id: toBigIntId(id) } },
      select: { auth_type: true, base_url: true, api_key: true, api_secret: true },
    });
    if (!row) {
      return undefined;
    }
    return { authType: row.auth_type, baseUrl: row.base_url, apiKey: row.api_key, apiSecret: row.api_secret };
  }

  async findByCompositeId(companyId: string, id: string): Promise<Integration | undefined> {
    const row = await this.prisma.integration_master.findUnique({
      where: { company_id_id: { company_id: companyId, id: toBigIntId(id) } },
      include: INTEGRATION_INCLUDE,
    });
    return row ? this.toIntegration(row) : undefined;
  }

  /**
   * Used by IntegrationsService.findMineForCompany() — the Company Admin's
   * own "GET my integration" route, which has no id to look up by (a brand
   * new company hasn't created one yet, and even after creating one the
   * frontend shouldn't have to separately remember/store its id). The
   * product design assumes one integration per company; the composite key
   * doesn't technically forbid more than one row per company_id, so this
   * deterministically returns the oldest (lowest id) row rather than
   * whichever one Postgres happens to return first.
   */
  async findByCompanyId(companyId: string): Promise<Integration | undefined> {
    const row = await this.prisma.integration_master.findFirst({
      where: { company_id: companyId },
      orderBy: { id: 'asc' },
      include: INTEGRATION_INCLUDE,
    });
    return row ? this.toIntegration(row) : undefined;
  }

  /**
   * companyId is now a separate parameter rather than a CreateIntegrationDto
   * field (RBAC revision: create() is Company-Admin-only, and companyId
   * always comes from the caller's own session, resolved in the
   * controller/service above this repository — never from client input).
   */
  async create(companyId: string, dto: CreateIntegrationDto): Promise<Integration> {
    const now = new Date();
    try {
      const row = await this.prisma.integration_master.create({
        data: {
          company_id: companyId,
          integration_type: dto.integrationType,
          auth_type: dto.authType,
          base_url: dto.baseUrl,
          api_key: dto.apiKey,
          api_secret: dto.apiSecret,
          // status is intentionally omitted — integration_master.status
          // defaults to 'Y' (CONNECTED) at the database level, per decision 8.
          add_date: now,
          edit_date: now,
        },
        include: INTEGRATION_INCLUDE,
      });
      return this.toIntegration(row);
    } catch (error) {
      this.handleWriteError(error);
    }
  }

  async update(companyId: string, id: string, dto: UpdateIntegrationDto): Promise<Integration | undefined> {
    try {
      const row = await this.prisma.integration_master.update({
        where: { company_id_id: { company_id: companyId, id: toBigIntId(id) } },
        data: {
          ...(dto.integrationType !== undefined && { integration_type: dto.integrationType }),
          ...(dto.authType !== undefined && { auth_type: dto.authType }),
          ...(dto.baseUrl !== undefined && { base_url: dto.baseUrl }),
          ...(dto.apiKey !== undefined && { api_key: dto.apiKey }),
          ...(dto.apiSecret !== undefined && { api_secret: dto.apiSecret }),
          ...(dto.status !== undefined && { status: toStatusCode(dto.status) }),
          edit_date: new Date(),
        },
        include: INTEGRATION_INCLUDE,
      });
      return this.toIntegration(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        // Matches InMemoryIntegrationsRepository's old contract: not found -> undefined,
        // letting IntegrationsService throw its own NotFoundException.
        return undefined;
      }
      this.handleWriteError(error);
    }
  }

  async remove(companyId: string, id: string): Promise<boolean> {
    try {
      await this.prisma.integration_master.delete({
        where: { company_id_id: { company_id: companyId, id: toBigIntId(id) } },
      });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return false;
      }
      this.handleWriteError(error);
    }
  }

  private toIntegration(row: IntegrationRow): Integration {
    return {
      id: row.id.toString(),
      companyId: row.company_id,
      // usm_company is a required (NOT NULL) relation on integration_master,
      // so `include` always returns it — no separate lookup, no null case.
      companyName: row.usm_company.title,
      integrationType: row.integration_type ?? '',
      authType: row.auth_type ?? '',
      baseUrl: row.base_url,
      status: fromStatusCode(row.status),
      // Both columns are required (NOT NULL) on integration_master, so any
      // row that exists always has both — this is effectively always true.
      // Never derive this from the credential values themselves in a log
      // or error message; only a boolean ever leaves this method.
      credentialsConfigured: Boolean(row.api_key && row.api_secret),
    };
  }

  /** Translates Postgres constraint violations into the app's clean {success:false,message} shape instead of leaking a raw Prisma error (or a credential value) to the client. */
  private handleWriteError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        const target = Array.isArray(error.meta?.target) ? error.meta.target.join(', ') : String(error.meta?.target ?? 'field');
        throw new ConflictException(`An integration with this ${target} already exists.`);
      }
      if (error.code === 'P2003') {
        throw new ConflictException('companyId does not refer to an existing company.');
      }
      if (error.code === 'P2025') {
        throw new NotFoundException('Integration not found.');
      }
    }
    throw error;
  }
}
