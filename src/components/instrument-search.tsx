"use client";

import { useState } from "react";
import Link from "next/link";

interface Instrument {
  symbol: string;
  name: string;
  exchange: string;
  sector: string | null;
}

export default function InstrumentSearch({ instruments }: { instruments: Instrument[] }) {
  const [query, setQuery] = useState("");

  const filtered = instruments.filter((i) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return i.symbol.toLowerCase().includes(q) || i.name.toLowerCase().includes(q);
  });

  return (
    <div>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by symbol or company name..."
        className="w-full max-w-md rounded-lg border border-brand-navy/15 px-4 py-2 text-sm outline-none focus:border-brand-primary"
      />
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((i) => (
          <Link
            key={i.symbol}
            href={`/app/instruments/${encodeURIComponent(i.symbol)}`}
            className="rounded-xl border border-black/5 bg-white p-4 hover:border-brand-primary"
          >
            <p className="text-sm font-semibold text-brand-navy">{i.symbol}</p>
            <p className="mt-1 text-xs text-brand-navy/60">{i.name}</p>
            {i.sector && (
              <p className="mt-2 text-[11px] uppercase tracking-wide text-brand-navy/40">
                {i.sector}
              </p>
            )}
          </Link>
        ))}
        {filtered.length === 0 && (
          <p className="col-span-full text-sm text-brand-navy/50">No instruments match &ldquo;{query}&rdquo;.</p>
        )}
      </div>
    </div>
  );
}
