export const CATALOG_PAGE_SIZE = 12;
export const NEWS_PAGE_SIZE = 12;

export function parsePageParam(raw: string | number | undefined, maxPage = 500): number {
  const n = parseInt(String(raw ?? "1"), 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, maxPage);
}

export function catalogSlice(page: string | number | undefined, pageSize = CATALOG_PAGE_SIZE) {
  const safePage = parsePageParam(page);
  return {
    page: safePage,
    pageSize,
    skip: (safePage - 1) * pageSize,
    take: pageSize,
  };
}

export function totalPages(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}
