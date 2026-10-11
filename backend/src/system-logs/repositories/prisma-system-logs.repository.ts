import { Injectable } from '@nestjs/common';
import { Prisma, system_logs as SystemLogRow } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RecordSystemLogInput, SystemLogEntry, SystemLogResource, SystemLogSeverity } from '../interfaces/system-log-entry.interface';

/**
 * Everything RecordSystemLogInput/SystemLogEntry carry that does NOT map to
 * a real `system_logs` column: the actor's display name (`user`) and the
 * caller-supplied `metadata` object. Both are folded into the `description`
 * column (see encodeDescription/decodeDescription below) rather than
 * dropped, so no information a caller passed to SystemLogsService.record()
 * is lost by this migration — see this file's class doc comment for why
 * neither field has a dedicated column to live in.
 */
interface DescriptionMeta {
  user: string;
  metadata?: Record<string, unknown>;
}

// Any text after this marker, on its own line, is a JSON-encoded
// DescriptionMeta payload rather than part of the human-readable
// description. Chosen to be extremely unlikely to appear in a naturally
// typed description string; decodeDescription() falls back to treating the
// whole stored value as plain text if it can't find/parse this marker, so a
// malformed or pre-migration row degrades gracefully instead of throwing.
const META_MARKER = '\n\n[[SYSLOG_META]]\n';

function encodeDescription(description: string, meta: DescriptionMeta): string {
  return `${description}${META_MARKER}${JSON.stringify(meta)}`;
}

function decodeDescription(stored: string | null): { description: string; meta: DescriptionMeta | null } {
  if (!stored) return { description: '', meta: null };
  const markerIndex = stored.indexOf(META_MARKER);
  if (markerIndex === -1) return { description: stored, meta: null };

  const description = stored.slice(0, markerIndex);
  const jsonPart = stored.slice(markerIndex + META_MARKER.length);
  try {
    const parsed = JSON.parse(jsonPart) as DescriptionMeta;
    return { description, meta: parsed };
  } catch {
    // Malformed JSON footer (shouldn't happen for rows this repository
    // wrote itself) — fail safe by surfacing the raw stored text rather
    // than throwing out of a read path.
    return { description: stored, meta: null };
  }
}

/** Returns null (never throws) on a non-numeric id — callers treat that as "not found", matching PrismaEmployeesRepository's toBigIntUserId() convention. */
function toBigIntId(id: string): bigint | null {
  try {
    return BigInt(id);
  } catch {
    return null;
  }
}

/**
 * PrismaSystemLogsRepository — reads/writes the real `system_logs` table.
 * Replaces InMemorySystemLogsRepository for this module only (see
 * system-logs.module.ts); that file is left on disk, unused, the same way
 * InMemoryCompaniesRepository/InMemoryIntegrationsRepository were left
 * after their own migrations.
 *
 * Column mapping and why it isn't 1:1 with SystemLogEntry:
 *
 * The `system_logs` table (see prisma/schema.prisma) was evidently modeled
 * as an HTTP-request-level access log — id, company_id, user_id, action,
 * module, description, ip_address, request_method, request_path, status,
 * created_at — not as the domain-action audit log SystemLogsService/
 * SystemLogEntry actually implement (severity, a typed resource, an
 * optional resourceId, a free-text actor display name, and an arbitrary
 * metadata object). Nothing in this phase changes that schema (per this
 * task's explicit constraints), so the mapping below adapts the repository
 * to the columns that exist rather than the other way around:
 *
 *   SystemLogEntry field -> system_logs column
 *   ------------------------------------------
 *   id           -> id (BigInt, exposed as its decimal string — same
 *                    convention as PrismaEmployeesRepository's
 *                    row.user_id.toString(). NOTE: this changes the id
 *                    FORMAT from the in-memory repo's `syslog_<uuid>` to a
 *                    plain numeric string. Nothing in this codebase parses
 *                    that old prefix, and in-memory log data was never
 *                    durable across a restart anyway, so this is a one-time,
 *                    documented format change rather than a compatibility
 *                    break.
 *   timestamp    -> created_at (DB-generated via @default(now()), not set
 *                    explicitly by this repository; exposed as an ISO
 *                    string, matching the in-memory repo's format).
 *   action       -> action (direct mapping; VARCHAR(100) comfortably fits
 *                    every action constant currently in use, e.g.
 *                    'INTEGRATION_FIELD_MAPPING_CREATED' is 34 chars).
 *   resource     -> module (direct mapping; VARCHAR(50) fits every
 *                    SystemLogResource literal, longest is
 *                    'IntegrationEndpoint' at 19 chars).
 *   severity     -> status (repurposed: `status` reads naturally as "this
 *                    entry's severity/outcome" for a domain audit log, and
 *                    every SystemLogSeverity value is well under
 *                    VARCHAR(20). This is the same kind of documented
 *                    column reuse the Integration auth gateways already do
 *                    with api_key/api_secret across auth types).
 *   resourceId   -> request_path (repurposed: stores the raw resourceId
 *                    value, NOT a real HTTP path — no caller currently
 *                    supplies an actual request path/method/IP to
 *                    SystemLogsService.record(), so this column was
 *                    otherwise going unused. request_path's VARCHAR(500)
 *                    comfortably fits any resourceId in use).
 *   user         -> folded into the `description` column as a JSON footer
 *                    (see encodeDescription/decodeDescription above) — see
 *                    "Known compatibility gaps" below for why.
 *   description  -> description (the human-readable prefix of the stored
 *                    value; see encodeDescription/decodeDescription).
 *   metadata     -> folded into the same JSON footer as `user`.
 *   companyId    -> company_id (Phase 2/Part C follow-up — see add() below;
 *                    previously always left null, see the note this
 *                    replaces further down).
 *   (none)       -> user_id, ip_address, request_method are left null by
 *                    this repository — see "Known compatibility gaps" below.
 *
 * Known compatibility gaps versus the in-memory model (documented here
 * rather than silently papered over, per this task's own instructions):
 *
 * - `user_id` is a real BigInt column, presumably meant to reference
 *   usm_users.user_id, but every one of the ~24 existing
 *   SystemLogsService.record() call sites passes an already-resolved
 *   display-name STRING (`user: actorName`), never a raw numeric id. There
 *   is no dedicated column for a free-text actor name, so `user` is folded
 *   into `description`'s JSON footer instead of attempting a lossy/invalid
 *   cast into `user_id`. Populating `user_id` for real would require
 *   threading a numeric actor id through every one of those call sites —
 *   out of scope for this phase (see the task's explicit list of untouched
 *   modules) and left as follow-up work.
 * - `company_id` (Phase 2/Part C follow-up): this used to be left null on
 *   every row, since SystemLogsController was Super-Admin-only and
 *   RecordSystemLogInput had no companyId field. Now that Company Admins
 *   have their own "recent activity" feed (GET /system-logs/mine), `add()`
 *   accepts an optional `companyId` and writes it to the real column —
 *   SystemLogsService derives it from `input.metadata.companyId`, which
 *   every Company-Admin-scoped call site already supplies (see that
 *   service's record() doc comment), so no call site needed to change.
 *   Rows written BEFORE this change still have company_id = null and won't
 *   appear in a company's activity feed — a one-time, documented gap, not
 *   a bug, exactly like the id-format change above.
 * - `ip_address` / `request_method` are left null: no caller currently
 *   gives SystemLogsService that information (it would have to be captured
 *   at the controller/interceptor level, which is unrelated to this
 *   phase's scope).
 *
 * Filtering/pagination: PaginationQueryDto (the only query DTO
 * SystemLogsController accepts) has page/limit only — no entity/action/date
 * filters exist in the current application at all, in-memory or otherwise
 * — so there is nothing beyond pagination and (now) company scoping to
 * preserve here. findAll()/findAllByCompany() both paginate at the database
 * level (skip/take + a separate count()), per the paginate.ts guidance for
 * any newly-Prisma-backed list method.
 */
@Injectable()
export class PrismaSystemLogsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * `companyId` (Phase 2/Part C follow-up): optional, written to the real
   * `company_id` column when the caller (SystemLogsService.record()) was
   * able to derive one from the entry's metadata. `null` for anything that
   * can't be tied to a single company (platform-level actions, Super Admin
   * actions on a resource that isn't company-scoped, etc.) — exactly the
   * previous, documented behavior for every row.
   */
  async add(input: RecordSystemLogInput, companyId?: string): Promise<SystemLogEntry> {
    const storedDescription = encodeDescription(input.description, {
      user: input.user,
      metadata: input.metadata,
    });

    const row = await this.prisma.system_logs.create({
      data: {
        action: input.action,
        module: input.resource,
        description: storedDescription,
        status: input.severity ?? 'INFO',
        request_path: input.resourceId ?? null,
        company_id: companyId ?? null,
      },
    });

    return this.toEntry(row);
  }

  /** Newest first, matching InMemorySystemLogsRepository's unshift()-based ordering. */
  async findAll(params: { skip: number; take: number }): Promise<{ entries: SystemLogEntry[]; total: number }> {
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.system_logs.findMany({
        orderBy: { created_at: 'desc' },
        skip: params.skip,
        take: params.take,
      }),
      this.prisma.system_logs.count(),
    ]);

    return { entries: rows.map((row) => this.toEntry(row)), total };
  }

  /**
   * Phase 2/Part C follow-up — backs the Company Admin's own "recent
   * activity" feed (GET /system-logs/mine). Only ever returns rows written
   * AFTER company_id started being populated (see add()'s doc comment) —
   * older rows have company_id = null and are excluded by this WHERE
   * clause, same as they would be for any other company.
   */
  async findAllByCompany(companyId: string, params: { skip: number; take: number }): Promise<{ entries: SystemLogEntry[]; total: number }> {
    const where: Prisma.system_logsWhereInput = { company_id: companyId };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.system_logs.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: params.skip,
        take: params.take,
      }),
      this.prisma.system_logs.count({ where }),
    ]);

    return { entries: rows.map((row) => this.toEntry(row)), total };
  }

  async findById(id: string): Promise<SystemLogEntry | undefined> {
    const numericId = toBigIntId(id);
    if (numericId === null) return undefined;

    const row = await this.prisma.system_logs.findUnique({ where: { id: numericId } });
    return row ? this.toEntry(row) : undefined;
  }

  private toEntry(row: SystemLogRow): SystemLogEntry {
    const { description, meta } = decodeDescription(row.description);

    return {
      id: row.id.toString(),
      // created_at has no `?` in the schema (@default(now()), never null),
      // so this is always a real Date.
      timestamp: row.created_at.toISOString(),
      user: meta?.user ?? 'Unknown',
      action: row.action,
      // Defensive fallback only: every row this repository writes sets
      // `module` from a real SystemLogResource value, so `row.module` is
      // only ever null for a row written by something else entirely.
      resource: (row.module as SystemLogResource | null) ?? 'Platform',
      resourceId: row.request_path ?? undefined,
      severity: (row.status as SystemLogSeverity | null) ?? 'INFO',
      description,
      metadata: meta?.metadata,
    };
  }
}
