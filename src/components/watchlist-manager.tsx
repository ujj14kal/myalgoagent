"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Plus, Search, Trash2 } from "lucide-react";
import { addToWatchlist, removeFromWatchlist } from "@/lib/watchlist-actions";
import EmptyState from "@/components/empty-state";
import { formatPct, formatPrice, toneOf, TONE_TEXT } from "@/lib/format";

interface WatchlistItem {
  id: string;
  symbol: string;
  name: string;
  close: number | null;
  changePct: number | null;
}

interface InstrumentOption {
  id: string;
  symbol: string;
  name: string;
}

export default function WatchlistManager({
  watchlistItems,
  allInstruments,
}: {
  watchlistItems: WatchlistItem[];
  allInstruments: InstrumentOption[];
}) {
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const watchedSymbols = new Set(watchlistItems.map((w) => w.symbol));

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) setError(result.error);
      } catch {
        setError("Couldn't complete that — please refresh the page and try again.");
      }
    });
  }

  const suggestions = query.trim()
    ? allInstruments
        .filter(
          (i) =>
            !watchedSymbols.has(i.symbol) &&
            (i.symbol.toLowerCase().includes(query.toLowerCase()) ||
              i.name.toLowerCase().includes(query.toLowerCase())),
        )
        .slice(0, 8)
    : [];

  return (
    <div>
      <div className="relative max-w-md">
        <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-navy/35" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Add an instrument — search by symbol or name…"
          aria-label="Search instruments to add"
          className="w-full rounded-xl border border-brand-navy/10 bg-white py-2.5 pl-10 pr-4 text-sm shadow-sm outline-none transition focus:border-brand-primary focus:ring-4 focus:ring-brand-primary/10"
        />
        {suggestions.length > 0 && (
          <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-black/[0.06] bg-white shadow-[var(--shadow-card-hover)]">
            {suggestions.map((i) => (
              <button
                key={i.id}
                type="button"
                onClick={() => {
                  run(() => addToWatchlist(i.id));
                  setQuery("");
                }}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-brand-primary/[0.04]"
              >
                <Plus size={15} className="shrink-0 text-brand-primary" />
                <span className="font-semibold text-brand-navy">{i.symbol}</span>
                <span className="truncate text-brand-navy/50">{i.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-brand-sell">{error}</p>}

      {watchlistItems.length === 0 ? (
        <div className="mt-6">
          <EmptyState pose="point" title="Your watchlist is empty." description="Search above to add the instruments you want to keep an eye on." />
        </div>
      ) : (
        <ul className="surface mt-6 divide-y divide-black/[0.05] overflow-hidden">
          {watchlistItems.map((w) => {
            const tone = w.changePct !== null ? toneOf(w.changePct) : "flat";
            return (
              <li key={w.id} className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-brand-primary/[0.02] sm:px-5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-primary/[0.07] text-xs font-bold text-brand-primary">
                  {w.symbol.replace(/\.NS$|\.BO$/, "").slice(0, 3)}
                </span>
                <Link href={`/app/instruments/${encodeURIComponent(w.symbol)}`} className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-brand-navy hover:text-brand-primary">{w.symbol}</span>
                  <span className="block truncate text-xs text-brand-navy/55">{w.name}</span>
                </Link>
                <div className="text-right">
                  <p className="num text-sm font-semibold text-brand-navy">{w.close !== null ? `₹${formatPrice(w.close)}` : "—"}</p>
                  <p className={`num text-xs font-semibold ${TONE_TEXT[tone]}`}>{w.changePct !== null ? formatPct(w.changePct) : "No quote"}</p>
                </div>
                <button
                  type="button"
                  onClick={() => run(() => removeFromWatchlist(w.id))}
                  disabled={isPending}
                  className="ml-1 rounded-lg p-2 text-brand-navy/30 transition-colors hover:bg-brand-sell/10 hover:text-brand-sell disabled:opacity-40"
                  aria-label={`Remove ${w.symbol} from watchlist`}
                >
                  <Trash2 size={15} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
