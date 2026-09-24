"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Search, X } from "lucide-react";

interface Instrument {
  symbol: string;
  name: string;
  exchange: string;
  sector: string | null;
}

function titleCase(s: string) {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function InstrumentSearch({ instruments }: { instruments: Instrument[] }) {
  const [query, setQuery] = useState("");
  const [sector, setSector] = useState<string | null>(null);

  const sectors = useMemo(() => {
    const counts = new Map<string, number>();
    for (const i of instruments) if (i.sector) counts.set(i.sector, (counts.get(i.sector) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s);
  }, [instruments]);

  const q = query.trim().toLowerCase();
  const filtered = instruments.filter(
    (i) => (!sector || i.sector === sector) && (!q || i.symbol.toLowerCase().includes(q) || i.name.toLowerCase().includes(q)),
  );

  return (
    <div>
      <div className="relative max-w-md">
        <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-navy/35" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by symbol or company name…"
          aria-label="Search instruments"
          className="w-full rounded-xl border border-brand-navy/10 bg-white py-2.5 pl-10 pr-9 text-sm shadow-sm outline-none transition focus:border-brand-primary focus:ring-4 focus:ring-brand-primary/10"
        />
        {query && (
          <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-brand-navy/40 hover:text-brand-navy">
            <X size={14} />
          </button>
        )}
      </div>

      {sectors.length > 1 && (
        <div className="mt-4 flex flex-wrap gap-1.5" role="group" aria-label="Filter by sector">
          <button
            type="button"
            onClick={() => setSector(null)}
            aria-pressed={sector === null}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${sector === null ? "bg-brand-navy text-white" : "bg-white text-brand-navy/60 ring-1 ring-brand-navy/10 hover:text-brand-primary"}`}
          >
            All · {instruments.length}
          </button>
          {sectors.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSector(sector === s ? null : s)}
              aria-pressed={sector === s}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${sector === s ? "bg-brand-navy text-white" : "bg-white text-brand-navy/60 ring-1 ring-brand-navy/10 hover:text-brand-primary"}`}
            >
              {titleCase(s)}
            </button>
          ))}
        </div>
      )}

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((i) => (
          <Link key={i.symbol} href={`/app/instruments/${encodeURIComponent(i.symbol)}`} className="surface surface-interactive group flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-primary/[0.07] text-xs font-bold tracking-tight text-brand-primary">
              {i.symbol.replace(/\.NS$|\.BO$/, "").slice(0, 3)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-brand-navy group-hover:text-brand-primary">{i.symbol}</span>
              <span className="block truncate text-xs text-brand-navy/55">{i.name}</span>
              {i.sector && <span className="mt-1 block text-[10px] font-semibold uppercase tracking-wide text-brand-navy/35">{i.sector}</span>}
            </span>
            <ChevronRight size={16} className="shrink-0 text-brand-navy/20 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-primary" />
          </Link>
        ))}
        {filtered.length === 0 && (
          <p className="col-span-full rounded-xl border border-dashed border-brand-navy/15 py-10 text-center text-sm text-brand-navy/50">
            No instruments match{query ? <> &ldquo;{query}&rdquo;</> : null}
            {sector ? <> in {titleCase(sector)}</> : null}.
          </p>
        )}
      </div>
    </div>
  );
}
