import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { paginatedResult, PaginatedResult, toSkipTake } from '../common/utils/paginate';
import { SystemLogsService } from '../system-logs/system-logs.service';
import { SettingsService } from '../settings/settings.service';
import { PrismaCompaniesRepository } from '../companies/repositories/prisma-companies.repository';
import { PrismaIntegrationsRepository } from './repositories/prisma-integrations.repository';
import { Integration, IntegrationStatus } from './interfaces/integration.interface';
import { CreateIntegrationDto } from './dto/create-integration.dto';
import { UpdateIntegrationDto } from './dto/update-integration.dto';
import { ConnectionTestResult, IntegrationEndpointExecutorService } from './services/integration-endpoint-executor.service';

/**
 * Integrations service — configuration records only, backed by the real
 * `integration_master` table via PrismaIntegrationsRepository.
 *
 * Deliberately has NO method that reaches out to a real HR system. The
 * `HRProvider` interface (src/integrations/interfaces/hr-provider.interface.ts,
 * from Phase 4A) is the intended seam for that: a future adapter class
 * implementing it would plug in here without this service's CRUD methods
 * changing, but no such adapter is written yet.
 *
 * Every lookup/update/delete here takes an already-resolved companyId — the
 * tenant-isolation check (is this caller allowed to use this companyId at
 * all) happens in IntegrationsController, before this service is called.
 *
 * RBAC note (see IntegrationsController): create()/updateForCompany() are
 * now reached only by a Company Admin acting on their own company; Super
 * Admin's remaining write access is limited to setStatusForCompany()
 * (activate/deactivate only).
 */
@Injectable()
export class IntegrationsService {
  constructor(
    private readonly repository: PrismaIntegrationsRepository,
    private readonly companiesRepository: PrismaCompaniesRepository,
    private readonly systemLogsService: SystemLogsService,
    private readonly settingsService: SettingsService,
    private readonly executor: IntegrationEndpointExecutorService,
  ) {}

  /**
   * Pagination now happens in PostgreSQL (see PrismaIntegrationsRepository.
   * findAll) — previously this endpoint had no pagination at all and
   * always returned every integration row. page/limit default the same way
   * every other list endpoint in the app does (see PaginationQueryDto).
   */
  async findAll(page: number, limit: number): Promise<PaginatedResult<Integration>> {
    const { skip, take, page: safePage, limit: safeLimit } = toSkipTake(page, limit);
    const { integrations, total } = await this.repository.findAll({ skip, take });
    return paginatedResult(integrations, safePage, safeLimit, total);
  }

  async findOneForCompany(companyId: string, id: string): Promise<Integration> {
    const integration = await this.repository.findByCompositeId(companyId, id);
    if (!integration) {
      throw new NotFoundException('Integration not found.');
    }
    return integration;
  }

  /**
   * Company Admin's "GET my integration" — no id required. Returns
   * `undefined` (never a 404) when the company hasn't created one yet; that
   * is a normal, expected state for a brand-new company, not an error.
   * IntegrationsController maps this to a 200 with `null` in the body.
   */
  async findMineForCompany(companyId: string): Promise<Integration | undefined> {
    return this.repository.findByCompanyId(companyId);
  }

  /**
   * Base-connection-only test (no endpoint needed yet) — see
   * IntegrationEndpointExecutorService.testConnection()'s doc comment for
   * exactly what counts as "reachable". Always logs the attempt, at
   * INFO/WARNING depending on the outcome, so a Super Admin auditing system
   * logs can see a company tested (and whether it worked) without that
   * being an alert-worthy event on its own — this never calls
   * settingsService.notifyIfEnabled(), unlike setStatusForCompany() going
   * to DISCONNECTED, since a test (pass or fail) isn't a status change.
   */
  async testConnection(companyId: string, id: string, actorName: string): Promise<ConnectionTestResult> {
    const integration = await this.repository.findByCompositeId(companyId, id);
    if (!integration) {
      throw new NotFoundException('Integration not found.');
    }

    const result = await this.executor.testConnection(companyId, id);

    this.systemLogsService.record({
      user: actorName,
      action: 'INTEGRATION_CONNECTION_TESTED',
      resource: 'Integration',
      resourceId: id,
      severity: result.reachable ? 'INFO' : 'WARNING',
      description: `Tested connection for ${integration.companyName}: ${result.reachable ? 'reachable' : 'unreachable'}.`,
      metadata: { integrationId: id, companyId, reachable: result.reachable, statusCode: result.statusCode },
    });

    return result;
  }

  /**
   * companyId is always the caller's own company (resolved in the
   * controller from the authenticated Company Admin's session) — never a
   * value taken from the request body. See CreateIntegrationDto's doc
   * comment for why companyId isn't a DTO field at all.
   */
  async create(companyId: string, dto: CreateIntegrationDto, actorName: string): Promise<Integration> {
    const company = await this.companiesRepository.findById(companyId);
    if (!company) {
      throw new BadRequestException('companyId does not refer to an existing company.');
    }

    const integration = await this.repository.create(companyId, dto);

    this.systemLogsService.record({
      user: actorName,
      action: 'INTEGRATION_CREATED',
      resource: 'Integration',
      resourceId: integration.id,
      description: `Created a ${integration.integrationType} integration for ${company.name}.`,
      metadata: { integrationId: integration.id, companyId: company.id },
    });

    return integration;
  }

  async updateForCompany(
    companyId: string,
    id: string,
    dto: UpdateIntegrationDto,
    actorName: string,
  ): Promise<Integration> {
    const updated = await this.repository.update(companyId, id, dto);
    if (!updated) {
      throw new NotFoundException('Integration not found.');
    }

    // apiKey/apiSecret must never reach system_logs (or any log). Build the
    // logged "changes" object explicitly rather than spreading dto, so a
    // future field added to UpdateIntegrationDto can't silently start
    // leaking into logs again.
    const safeChanges: Record<string, unknown> = {};
    if (dto.integrationType !== undefined) safeChanges.integrationType = dto.integrationType;
    if (dto.authType !== undefined) safeChanges.authType = dto.authType;
    if (dto.baseUrl !== undefined) safeChanges.baseUrl = dto.baseUrl;
    if (dto.status !== undefined) safeChanges.status = dto.status;
    if (dto.apiKey !== undefined) safeChanges.apiKeyRotated = true;
    if (dto.apiSecret !== undefined) safeChanges.apiSecretRotated = true;

    this.systemLogsService.record({
      user: actorName,
      action: 'INTEGRATION_UPDATED',
      resource: 'Integration',
      resourceId: updated.id,
      description: `Updated integration for ${updated.companyName}.`,
      metadata: { integrationId: updated.id, companyId, changes: safeChanges },
    });

    return updated;
  }

  /**
   * Super-Admin-only activate/deactivate. Narrower than updateForCompany():
   * only ever writes `status`, never baseUrl/apiKey/apiSecret/type, by
   * construction — UpdateIntegrationStatusDto has no other fields to pass
   * through even if this method were ever called incorrectly.
   *
   * Settings module hook ("Integration Warnings"): going to DISCONNECTED
   * triggers SettingsService.notifyIfEnabled(), which console-logs a
   * warning if that toggle is on. Going to CONNECTED never does — an
   * integration coming back online isn't a warning.
   */
  async setStatusForCompany(
    companyId: string,
    id: string,
    status: IntegrationStatus,
    actorName: string,
  ): Promise<Integration> {
    const updated = await this.repository.update(companyId, id, { status });
    if (!updated) {
      throw new NotFoundException('Integration not found.');
    }

    this.systemLogsService.record({
      user: actorName,
      action: status === 'CONNECTED' ? 'INTEGRATION_ACTIVATED' : 'INTEGRATION_DEACTIVATED',
      resource: 'Integration',
      resourceId: updated.id,
      description: `${status === 'CONNECTED' ? 'Activated' : 'Deactivated'} integration for ${updated.companyName}.`,
      metadata: { integrationId: updated.id, companyId, status },
    });

    if (status === 'DISCONNECTED') {
      this.settingsService.notifyIfEnabled(
        'integrationWarnings',
        `Integration disconnected for ${updated.companyName}`,
        `Deactivated by ${actorName}.`,
      );
    }

    return updated;
  }

  async removeForCompany(companyId: string, id: string, actorName: string): Promise<void> {
    const integration = await this.repository.findByCompositeId(companyId, id);
    if (!integration) {
      throw new NotFoundException('Integration not found.');
    }

    await this.repository.remove(companyId, id);

    this.systemLogsService.record({
      user: actorName,
      action: 'INTEGRATION_DELETED',
      resource: 'Integration',
      resourceId: id,
      severity: 'WARNING',
      description: `Deleted integration for ${integration.companyName}.`,
      metadata: { integrationId: id, companyId },
    });
  }
}
