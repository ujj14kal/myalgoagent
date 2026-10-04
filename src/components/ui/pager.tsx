import Link from "next/link";
import { PAGE_SIZES, pageLinks, type PageWindow } from "@/lib/pagination";

/**
 * Previous / next, page numbers and page size for a server-paged list. `params` are the other
 * query parameters (filters, search) so they survive moving between pages; changing the page size
 * goes back to page 1.
 */
export default function Pager({ basePath, params, window: w }: { basePath: string; params?: Record<string, string | undefined>; window: PageWindow }) {
  const href = (over: Record<string, string | number | undefined>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...params, ...over })) if (v !== undefined && v !== "" && !(k === "page" && v === 1)) q.set(k, String(v));
    const s = q.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  if (w.total === 0) return null;
  const btn = "rounded-lg px-2.5 py-1 text-xs font-semibold ring-1 ring-black/10 hover:bg-brand-navy/[0.04]";
  const off = "pointer-events-none opacity-40";
  return (
    <nav aria-label="Pagination" className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-brand-navy/60">
      <p>
        Showing {w.from.toLocaleString("en-IN")}–{w.to.toLocaleString("en-IN")} of {w.total.toLocaleString("en-IN")}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <Link href={href({ page: w.page - 1, size: w.size })} aria-disabled={w.page <= 1} className={`${btn} ${w.page <= 1 ? off : ""}`}>
          ← Previous
        </Link>
        {pageLinks(w.page, w.pages).map((n, i) =>
          n === null ? (
            <span key={`gap-${i}`} className="px-1">
              …
            </span>
          ) : (
            <Link key={n} href={href({ page: n, size: w.size })} aria-current={n === w.page ? "page" : undefined} className={`${btn} ${n === w.page ? "bg-brand-primary text-white ring-brand-primary" : ""}`}>
              {n}
            </Link>
          ),
        )}
        <Link href={href({ page: w.page + 1, size: w.size })} aria-disabled={w.page >= w.pages} className={`${btn} ${w.page >= w.pages ? off : ""}`}>
          Next →
        </Link>
      </div>
      <div className="flex items-center gap-1.5">
        <span>Per page</span>
        {PAGE_SIZES.map((s) => (
          <Link key={s} href={href({ size: s, page: 1 })} aria-current={s === w.size ? "true" : undefined} className={`rounded-md px-1.5 py-0.5 font-semibold ${s === w.size ? "bg-brand-navy text-white" : "ring-1 ring-black/10"}`}>
            {s}
          </Link>
        ))}
      </div>
    </nav>
  );
}
