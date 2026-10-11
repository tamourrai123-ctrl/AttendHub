import { Injectable, Logger } from '@nestjs/common';
import { paginatedResult, PaginatedResult, toSkipTake } from '../common/utils/paginate';
import { PrismaMonitoringRepository } from './repositories/prisma-monitoring.repository';
import { ApiLog, ApiMonitoringSummary } from './interfaces/api-log.interface';
import { SettingsService } from '../settings/settings.service';

/**
 * As of the Monitoring Postgres migration, this runs on
 * PrismaMonitoringRepository (the real `api_logs` table) instead of
 * InMemoryMonitoringRepository — see that repository's own doc comment for
 * the column mapping and the one new column it needed.
 */
@Injectable()
export class MonitoringService {
  private readonly logger = new Logger(MonitoringService.name);

  constructor(
    private readonly repository: PrismaMonitoringRepository,
    private readonly settingsService: SettingsService,
  ) {}

  /**
   * Settings module hook ("API Failure Alerts"): a logged call with
   * statusCode >= 400 triggers SettingsService.notifyIfEnabled(), which
   * console-logs a warning if that toggle is on. Every entry recorded here
   * has already passed MonitoringInterceptor's own scope filter (only a
   * Company Admin's own /integrations requests — see
   * common/interceptors/monitoring.interceptor.ts), so this alert is
   * automatically scoped the same way, with no extra filtering needed here.
   *
   * Kept synchronous-looking (returns void, not awaited by
   * MonitoringInterceptor) so a slow or failed database write never blocks
   * or fails the request it's recording — the same fire-and-forget pattern
   * SystemLogsService.record() already uses for the same reason. The
   * underlying write is still real, async database I/O; failures are caught
   * and logged here rather than thrown.
   */
  record(entry: Omit<ApiLog, 'id' | 'requestId' | 'timestamp'>): void {
    this.repository.record(entry).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to persist API log entry (${entry.method} ${entry.endpoint}): ${message}`);
    });

    if (entry.statusCode >= 400) {
      this.settingsService.notifyIfEnabled(
        'apiFailureAlerts',
        `${entry.method} ${entry.endpoint} → ${entry.statusCode}`,
        entry.companyId ? `companyId=${entry.companyId}` : 'no companyId on request',
      );
    }
  }

  /**
   * Pagination now happens in PostgreSQL (see PrismaMonitoringRepository.
   * findAll) rather than fetching every row and slicing an array — see
   * paginate.ts's guidance for any newly-Prisma-backed list method.
   */
  async findAll(page: number, limit: number): Promise<PaginatedResult<ApiLog>> {
    const { skip, take, page: safePage, limit: safeLimit } = toSkipTake(page, limit);
    const { entries, total } = await this.repository.findAll({ skip, take });
    return paginatedResult(entries, safePage, safeLimit, total);
  }

  async summary(): Promise<ApiMonitoringSummary> {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const { total, successful, averageResponseTimeMs } = await this.repository.summarySince(startOfToday);

    return {
      requestsToday: total,
      successfulRequests: successful,
      failedRequests: total - successful,
      averageResponseTimeMs,
    };
  }
}
