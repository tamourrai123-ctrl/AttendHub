import { Injectable, Logger } from '@nestjs/common';
import { paginatedResult, PaginatedResult, toSkipTake } from '../common/utils/paginate';
import { PrismaSystemLogsRepository } from './repositories/prisma-system-logs.repository';
import { RecordSystemLogInput, SystemLogEntry } from './interfaces/system-log-entry.interface';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class SystemLogsService {
  private readonly logger = new Logger(SystemLogsService.name);

  constructor(
    private readonly repository: PrismaSystemLogsRepository,
    private readonly settingsService: SettingsService,
  ) {}

  /**
   * Called by other services (auth, companies, employees, integrations,
   * pricing) to record an action. Deliberately kept synchronous-looking
   * (returns void, not awaited by any of its ~24 existing call sites) so
   * this migration to a real database did not require touching any of
   * those call sites: a system-log write failure must never block or fail
   * the primary business operation it's recording (e.g. creating a company
   * should still succeed even if the audit write fails). The underlying
   * write is still real, async database I/O — failures are caught and
   * logged here (without ever logging the raw input, which may carry
   * caller-supplied metadata) rather than thrown or silently swallowed.
   *
   * Settings module hook ("System Error Alerts"): an entry with severity
   * ERROR or CRITICAL also triggers SettingsService.notifyIfEnabled(),
   * which console-logs a warning if that toggle is on. This check never
   * blocks or delays the log write itself — it runs alongside it, not
   * before or after.
   *
   * Phase 2/Part C follow-up (Company Admin "recent activity" feed): no
   * call site needed to change to support this — `companyId` is derived
   * automatically from `input.metadata.companyId` when present, since every
   * Company-Admin-scoped call site in this codebase (Employees,
   * Integrations, Endpoints, Field Mappings, Attendance punch forwarding)
   * already puts `companyId` in its metadata object for its own audit
   * purposes. A platform-level entry with no companyId in its metadata
   * (e.g. a Super Admin action, or an entry logged before this feature
   * existed) simply gets `company_id = null`, same as always.
   */
  record(input: RecordSystemLogInput): void {
    const companyId = this.extractCompanyId(input.metadata);

    this.repository.add(input, companyId).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to persist system log entry (action=${input.action}, resource=${input.resource}): ${message}`);
    });

    const severity = input.severity ?? 'INFO';
    if (severity === 'ERROR' || severity === 'CRITICAL') {
      this.settingsService.notifyIfEnabled('systemErrorAlerts', `${severity}: ${input.action}`, input.description);
    }
  }

  private extractCompanyId(metadata?: Record<string, unknown>): string | undefined {
    const value = metadata?.companyId;
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  /**
   * Pagination now happens in PostgreSQL (see PrismaSystemLogsRepository.
   * findAll): this only converts page/limit into skip/take and assembles
   * the response — see paginate.ts, which explicitly calls out
   * SystemLogsService as the one remaining caller of the old in-memory
   * paginate() helper until this migration. The {items, meta} response
   * contract is unchanged.
   */
  async findAll(page: number, limit: number): Promise<PaginatedResult<SystemLogEntry>> {
    const { skip, take, page: safePage, limit: safeLimit } = toSkipTake(page, limit);
    const { entries, total } = await this.repository.findAll({ skip, take });
    return paginatedResult(entries, safePage, safeLimit, total);
  }

  async findById(id: string): Promise<SystemLogEntry | undefined> {
    return this.repository.findById(id);
  }

  /**
   * Phase 2/Part C follow-up — backs GET /system-logs/mine, the Company
   * Admin's own "recent activity" feed (used by the Dashboard). Only ever
   * returns entries recorded for that company since companyId started being
   * captured (see PrismaSystemLogsRepository's doc comment) — a brand-new
   * company simply has an empty feed until it does something.
   */
  async findAllForCompany(companyId: string, page: number, limit: number): Promise<PaginatedResult<SystemLogEntry>> {
    const { skip, take, page: safePage, limit: safeLimit } = toSkipTake(page, limit);
    const { entries, total } = await this.repository.findAllByCompany(companyId, { skip, take });
    return paginatedResult(entries, safePage, safeLimit, total);
  }
}
