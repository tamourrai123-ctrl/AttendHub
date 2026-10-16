/**
 * The backend caps every list request at 100 rows per page (PaginationQueryDto), so anything that needs the
 * WHOLE list (dashboard counts, a drawer that shows every endpoint) walks the pages instead of asking for a
 * huge limit. `maxPages` is a safety stop so a misbehaving API can never loop forever.
 */
export const MAX_PAGE_LIMIT = 100;

interface PageLike<T> {
  items: T[];
  total: number;
}

export async function fetchAllPages<T>(
  fetchPage: (page: number, limit: number) => Promise<PageLike<T>>,
  maxPages = 50,
): Promise<{ items: T[]; total: number }> {
  const items: T[] = [];
  let total = 0;
  for (let page = 1; page <= maxPages; page += 1) {
    const result = await fetchPage(page, MAX_PAGE_LIMIT);
    total = result.total;
    items.push(...result.items);
    if (result.items.length === 0 || items.length >= result.total) break;
  }
  return { items, total };
}

/** The last page number that can hold rows — 1 when the list is empty. */
export function lastPageOf(total: number, limit: number): number {
  return Math.max(1, Math.ceil(total / Math.max(1, limit)));
}
