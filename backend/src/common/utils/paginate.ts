export interface PaginatedResult<T> {
  items: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
  };
}

/**
 * Simple in-memory pagination — slices an already-filtered array. Kept only
 * for SystemLogsService, which still runs on InMemorySystemLogsRepository
 * (out of scope for the Prisma repository-pattern fixes). Do NOT use this
 * for any Prisma-backed repository's list method — Companies, Employees,
 * and Integrations all paginate at the database level (skip/take + a
 * separate count()) and assemble their PaginatedResult via
 * paginatedResult() below instead. See the Prisma repository audit report
 * for why: paginating an already-fully-fetched array defeats the point once
 * a table can hold thousands/millions of rows.
 */
export function paginate<T>(all: T[], page = 1, limit = 20): PaginatedResult<T> {
  const safePage = page > 0 ? page : 1;
  const safeLimit = limit > 0 ? limit : 20;
  const start = (safePage - 1) * safeLimit;

  return {
    items: all.slice(start, start + safeLimit),
    meta: {
      page: safePage,
      limit: safeLimit,
      total: all.length,
    },
  };
}

/**
 * Assembles the same { items, meta } shape as paginate(), but for a page
 * that was already fetched from the database with skip/take — `items` is
 * just that page, and `total` comes from a separate count() query, not
 * `items.length`. This is the shape every Prisma-backed list repository
 * (Companies/Employees/Integrations) should return through; use it instead
 * of hand-assembling the { items, meta } object in each service.
 */
export function paginatedResult<T>(items: T[], page: number, limit: number, total: number): PaginatedResult<T> {
  return { items, meta: { page, limit, total } };
}

/**
 * Converts a 1-based page + limit into Prisma's skip/take, clamping both to
 * sane minimums so a bad/omitted query param can't request a negative skip
 * or an unbounded take. Returns the clamped page/limit alongside skip/take
 * so callers can hand them straight to paginatedResult() without having to
 * reverse-derive "page" from skip/take afterwards.
 */
export function toSkipTake(page = 1, limit = 20): { skip: number; take: number; page: number; limit: number } {
  const safePage = page > 0 ? page : 1;
  const safeLimit = limit > 0 ? limit : 20;
  return { skip: (safePage - 1) * safeLimit, take: safeLimit, page: safePage, limit: safeLimit };
}
