"use client";

import { Children, useState } from "react";

// Pages a long list on its own once it passes `limit` rows: pass the rows as children and they are cut into pages
// here, in the browser (for lists that arrive whole, such as a backtest's trades; lists loaded page by page from
// the database use <Pager> instead). A list at or under the limit shows no controls at all.
//   <tbody><AutoPager colSpan={7}>{rows}</AutoPager></tbody>      — a table body
//   <ul><AutoPager as="list">{items}</AutoPager></ul>              — a list

const SIZES = [10, 25, 50, 100] as const;

export default function AutoPager({ children, limit = 25, colSpan = 1, as = "table" }: { children: React.ReactNode; limit?: number; colSpan?: number; as?: "table" | "list" }) {
  const rows = Children.toArray(children);
  const [size, setSize] = useState<number>(limit);
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(rows.length / size));
  // A shorter list (a filter, new data) can leave the stored page past the end: it is clamped when read below.
  if (rows.length <= limit) return <>{rows}</>;

  const at = Math.min(page, pages);
  const from = (at - 1) * size;
  const to = Math.min(from + size, rows.length);
  const btn = "rounded-lg px-2.5 py-1 text-xs font-semibold ring-1 ring-black/10 hover:bg-brand-navy/[0.04] disabled:pointer-events-none disabled:opacity-40";
  const bar = (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2 text-xs text-brand-navy/60">
      <p>
        Showing {(from + 1).toLocaleString("en-IN")}–{to.toLocaleString("en-IN")} of {rows.length.toLocaleString("en-IN")}
      </p>
      <div className="flex items-center gap-1.5">
        <button type="button" className={btn} disabled={at <= 1} onClick={() => setPage(at - 1)}>
          ← Previous
        </button>
        <span className="px-1 tabular-nums">
          Page {at} of {pages}
        </span>
        <button type="button" className={btn} disabled={at >= pages} onClick={() => setPage(at + 1)}>
          Next →
        </button>
      </div>
      <div className="flex items-center gap-1.5">
        <span>Per page</span>
        {SIZES.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={s === size}
            onClick={() => {
              setSize(s);
              setPage(1);
            }}
            className={`rounded-md px-1.5 py-0.5 font-semibold ${s === size ? "bg-brand-navy text-white" : "ring-1 ring-black/10"}`}
          >
            {s}
          </button>
        ))}
      </div>
    </nav>
  );

  return (
    <>
      {rows.slice(from, to)}
      {as === "table" ? (
        <tr>
          <td colSpan={colSpan}>{bar}</td>
        </tr>
      ) : (
        <li className="list-none">{bar}</li>
      )}
    </>
  );
}
