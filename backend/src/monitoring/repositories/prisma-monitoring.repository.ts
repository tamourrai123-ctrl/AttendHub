import { Injectable } from '@nestjs/common';
import { api_logs as ApiLogRow } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ApiLog, HttpMethod } from '../interfaces/api-log.interface';

/** Returns null (never throws) on a non-numeric id — matching PrismaSystemLogsRepository's toBigIntId() convention. */
function toBigIntId(value: string): bigint | null {
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

/**
 * PrismaMonitoringRepository — reads/writes the real `api_logs` table.
 * Replaces InMemoryMonitoringRepository for this module only (see
 * monitoring.module.ts); that file is left on disk, unused, the same way
 * InMemorySystemLogsRepository was left after its own migration.
 *
 * Column mapping (see scripts/add-monitoring-response-time-column.ts for the
 * one column that had to be added):
 *
 *   ApiLog field    -> api_logs column
 *   -------------------------------------
 *   id              -> id (BigInt, exposed as its decimal string — same
 *                       convention as PrismaSystemLogsRepository).
 *   requestId       -> also id.toString(). api_logs has no separate UUID
 *                       request-id column, and nothing in this codebase
 *                       compares `id` against `requestId` — they're just two
 *                       display fields on the same log entry — so reusing
 *                       the row id for both avoids adding a column purely
 *                       for a value that's already unique. Same documented
 *                       simplification PrismaSystemLogsRepository already
 *                       makes for SystemLogEntry.id's format.
 *   timestamp       -> add_date (DB-generated via @default(now())).
 *   companyId       -> company_id.
 *   userId          -> user_id (BigInt?) — MonitoringInterceptor passes the
 *                       AuthenticatedUser.userId string, which for a mobile
 *                       session is a composite "companyId:employeeId" value
 *                       (see MobileAuthService.issueSession()), not a plain
 *                       number. toBigIntId() returns null for that shape,
 *                       same as any other non-numeric id, so the column is
 *                       just left null rather than throwing — the row is
 *                       still written with everything else intact.
 *   endpoint        -> request_path.
 *   method          -> request_method.
 *   statusCode      -> response_status.
 *   responseTimeMs  -> response_time_ms (added column).
 *   (none)          -> status is also set, to "SUCCESS"/"FAILURE" derived
 *                       from statusCode — free to fill in, not read back by
 *                       this interface, but keeps the table meaningful if
 *                       inspected directly. request_body/response_body/
 *                       ip_address/user_agent/error_message are left null:
 *                       MonitoringInterceptor never captures them today.
 *
 * No MAX_ENTRIES cap here (the in-memory repo capped at 500 so a
 * long-running dev process didn't grow unbounded) — Postgres has no such
 * concern, same reasoning as every other Prisma-backed log table in this
 * project.
 */
@Injectable()
export class PrismaMonitoringRepository {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: Omit<ApiLog, 'id' | 'requestId' | 'timestamp'>): Promise<ApiLog> {
    const row = await this.prisma.api_logs.create({
      data: {
        company_id: entry.companyId ?? null,
        user_id: entry.userId ? toBigIntId(entry.userId) : null,
        request_method: entry.method,
        request_path: entry.endpoint,
        response_status: entry.statusCode,
        response_time_ms: entry.responseTimeMs,
        status: entry.statusCode < 400 ? 'SUCCESS' : 'FAILURE',
      },
    });
    return this.toApiLog(row);
  }

  /** Newest first, matching InMemoryMonitoringRepository's unshift()-based ordering. */
  async findAll(params: { skip: number; take: number }): Promise<{ entries: ApiLog[]; total: number }> {
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.api_logs.findMany({
        orderBy: { add_date: 'desc' },
        skip: params.skip,
        take: params.take,
      }),
      this.prisma.api_logs.count(),
    ]);

    return { entries: rows.map((row) => this.toApiLog(row)), total };
  }

  /**
   * Aggregated in PostgreSQL rather than fetching every row for today and
   * reducing in JS (the in-memory repo's approach) — see the Prisma
   * repository audit report's guidance for any newly-Prisma-backed summary
   * query.
   */
  async summarySince(startOfToday: Date): Promise<{ total: number; successful: number; averageResponseTimeMs: number }> {
    const [total, successful, avg] = await this.prisma.$transaction([
      this.prisma.api_logs.count({ where: { add_date: { gte: startOfToday } } }),
      this.prisma.api_logs.count({ where: { add_date: { gte: startOfToday }, response_status: { lt: 400 } } }),
      this.prisma.api_logs.aggregate({
        where: { add_date: { gte: startOfToday } },
        _avg: { response_time_ms: true },
      }),
    ]);

    return {
      total,
      successful,
      averageResponseTimeMs: Math.round(avg._avg.response_time_ms ?? 0),
    };
  }

  private toApiLog(row: ApiLogRow): ApiLog {
    return {
      id: row.id.toString(),
      requestId: row.id.toString(),
      timestamp: row.add_date.toISOString(),
      companyId: row.company_id ?? undefined,
      userId: row.user_id?.toString(),
      endpoint: row.request_path,
      method: row.request_method as HttpMethod,
      statusCode: row.response_status ?? 0,
      responseTimeMs: row.response_time_ms ?? 0,
    };
  }
}
