/**
 * Names of LOV groups (app_lov_master.title) this codebase reads.
 *
 * Inspection (scripts/inspect-hr-integration-foundation.ts +
 * scripts/inspect-lov-vu-definition.ts, run against the real database)
 * confirmed:
 *   - app_lov_master / app_lov_detail exist but currently have ZERO rows —
 *     no LOV group of any name has been seeded yet.
 *   - lov_vu is a real Postgres VIEW (not visible to Prisma's schema, since
 *     `views` is not an enabled preview feature) defined as:
 *       SELECT m.id AS lov_id, m.title AS lov_name, d.display AS title,
 *              d.return AS value, d.sorting, d.status
 *       FROM app_lov_master m JOIN app_lov_detail d ON m.id = d.pid
 *       ORDER BY m.id, d.id;
 *     i.e. `lov_name` is simply app_lov_master.title, and `value` is
 *     app_lov_detail.return (VARCHAR(3) — matching integration_master's
 *     auth_type/integration_type/api_version column widths exactly).
 *   - A full grep of this project's src/ tree found no existing LOV
 *     module/controller/service anywhere — this is genuinely the first
 *     consumer of app_lov_master/app_lov_detail in this codebase.
 *
 * Because no LOV group name convention existed before this feature,
 * 'INTEGRATION_AUTH_TYPE' below is a NEW convention introduced by this
 * change (the same way ADMIN_FLAG_VALUE and similar conventions were
 * introduced during the earlier Companies/Employees migrations) — not a
 * discovered pre-existing name. It is deliberately named descriptively so
 * it reads clearly in app_lov_master.title if inspected directly in the
 * database.
 *
 * LovService queries the underlying app_lov_master/app_lov_detail tables
 * directly via Prisma (not the lov_vu view — Prisma has full typed model
 * access to the two base tables already, so there is no need to issue raw
 * SQL against a view that exists mainly for non-Prisma / cross-application
 * consumers). The view's column semantics above are documented here purely
 * so LovService's mapping is traceable back to real, inspected behavior.
 */
export const LOV_GROUPS = {
  /**
   * Valid integration_master.auth_type codes for the new HR Integration
   * Gateway feature (API Key / Basic Auth / OAuth 2.0). See
   * scripts/seed-integration-auth-type-lov.ts for the optional, manual,
   * data-only seed of this group's rows — nothing in this codebase
   * hardcodes these codes as a validation whitelist; if this group has no
   * rows, LovService correctly reports that no auth types are configured
   * yet rather than falling back to an invented list.
   */
  INTEGRATION_AUTH_TYPE: 'INTEGRATION_AUTH_TYPE',
} as const;

export type LovGroupName = (typeof LOV_GROUPS)[keyof typeof LOV_GROUPS];
