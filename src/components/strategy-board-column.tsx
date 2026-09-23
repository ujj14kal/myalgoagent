"use client";

import { useState } from "react";
import Link from "next/link";

export type StrategyCard = {
  id: string;
  name: string;
  status: string;
  mode: string;
  instrument: { symbol: string };
};

const STATUS_DOT: Record<string, string> = {
  ACTIVE: "bg-brand-buy",
  DRAFT: "bg-brand-navy/40",
  ARCHIVED: "bg-brand-navy/30",
  DELETED: "bg-brand-sell",
};

const PAGE_SIZE = 4;

export function StrategyRowCard({ s }: { s: StrategyCard }) {
  return (
    <Link
      href={`/app/strategies/${s.id}`}
      className="hover-lift block rounded-xl border border-black/5 bg-white p-4 hover:border-brand-primary"
    >
      <div className="flex items-start gap-2">
        <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[s.status]}`} />
        <p className="text-sm font-semibold leading-tight text-brand-navy">{s.name}</p>
      </div>
      <p className="mt-1.5 pl-4 text-xs text-brand-navy/60">{s.instrument.symbol}</p>
      <p className="mt-2 pl-4 text-xs font-medium text-brand-navy/40">
        {s.mode === "NO_CODE" ? "Built visually" : "Built with code"}
      </p>
    </Link>
  );
}

export default function StrategyBoardColumn({
  title,
  description,
  strategies,
  accent,
  addHref,
  emptyLabel,
}: {
  title: string;
  description: string;
  strategies: StrategyCard[];
  accent: string;
  addHref?: string;
  emptyLabel?: string;
}) {
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(strategies.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const paged = strategies.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  return (
    <div className="flex min-w-0 flex-1 flex-col rounded-2xl border border-black/5 bg-brand-bg/40">
      <div className={`rounded-t-2xl border-b border-black/5 px-4 py-3 ${accent}`}>
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-brand-navy">{title}</h2>
          <span className="rounded-full bg-white/70 px-2 py-0.5 text-xs font-semibold text-brand-navy/60">
            {strategies.length}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-brand-navy/50">{description}</p>
      </div>

      <div className="flex min-h-[420px] flex-1 flex-col p-3">
        {strategies.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-black/10 px-3 py-6 text-center">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/5 text-brand-navy/25">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="4" width="16" height="16" rx="3" />
                <path d="M4 10h16" />
              </svg>
            </span>
            <p className="text-xs text-brand-navy/35">{emptyLabel ?? "Nothing here"}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 content-start gap-2 sm:grid-cols-2">
            {paged.map((s) => (
              <StrategyRowCard key={s.id} s={s} />
            ))}
          </div>
        )}

        {addHref && (
          <Link
            href={addHref}
            className="mt-2 flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-brand-primary/30 px-3 py-3 text-xs font-semibold text-brand-primary hover:border-brand-primary hover:bg-brand-primary/5"
          >
            + New strategy
          </Link>
        )}

        {totalPages > 1 && (
          <div className="mt-auto flex items-center justify-between border-t border-black/5 pt-2.5">
            <button
              type="button"
              disabled={safePage === 0}
              onClick={() => setPage((p) => p - 1)}
              className="rounded-full border border-black/10 px-3 py-1 text-xs font-medium text-brand-navy/60 disabled:opacity-30 hover:border-brand-primary hover:text-brand-primary"
            >
              ← Prev
            </button>
            <span className="text-[11px] font-medium text-brand-navy/40">
              Page {safePage + 1} of {totalPages}
            </span>
            <button
              type="button"
              disabled={safePage === totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-full border border-black/10 px-3 py-1 text-xs font-medium text-brand-navy/60 disabled:opacity-30 hover:border-brand-primary hover:text-brand-primary"
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
