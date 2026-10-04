// Server-side paging shared by the list pages: the page and size come from the URL, the database
// is asked for just that page (skip/take) plus a count, and an out-of-range page is pulled back to
// the last real one (e.g. after deleting the last item on a page).

export const PAGE_SIZES = [10, 25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 25;

export type PageQuery = { page?: string | string[]; size?: string | string[] };
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** The requested page and size from the URL, with anything unexpected replaced by a safe default. */
export function readPageQuery(q: PageQuery, defaultSize: number = DEFAULT_PAGE_SIZE): { page: number; size: number } {
  const wanted = Number.parseInt(first(q.size) ?? "", 10);
  const size = (PAGE_SIZES as readonly number[]).includes(wanted) ? wanted : defaultSize;
  const page = Number.parseInt(first(q.page) ?? "", 10);
  return { page: Number.isFinite(page) && page >= 1 ? page : 1, size };
}

export type PageWindow = { page: number; size: number; pages: number; total: number; skip: number; take: number; from: number; to: number };

/** The window to show given the total: the page is clamped to 1..pages. */
export function pageWindow(total: number, page: number, size: number): PageWindow {
  const pages = Math.max(1, Math.ceil(total / size));
  const p = Math.min(Math.max(1, page), pages);
  const skip = (p - 1) * size;
  return { page: p, size, pages, total, skip, take: size, from: total === 0 ? 0 : skip + 1, to: Math.min(total, skip + size) };
}

/** Which page links to show: the first, the last, and a few around the current one (null = a gap). */
export function pageLinks(page: number, pages: number): (number | null)[] {
  const keep = new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages));
  const out: (number | null)[] = [];
  let prev = 0;
  for (const n of [...keep].sort((a, b) => a - b)) {
    if (n - prev > 1) out.push(null);
    out.push(n);
    prev = n;
  }
  return out;
}
