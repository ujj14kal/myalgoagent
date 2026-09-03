"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { addToWatchlist, removeFromWatchlist } from "@/lib/watchlist-actions";

interface WatchlistItem {
  id: string;
  symbol: string;
  name: string;
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
  const [isPending, startTransition] = useTransition();
  const watchedSymbols = new Set(watchlistItems.map((w) => w.symbol));

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
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Add an instrument to your watchlist..."
          className="w-full rounded-lg border border-brand-navy/15 px-4 py-2 text-sm outline-none focus:border-brand-primary"
        />
        {suggestions.length > 0 && (
          <div className="absolute z-10 mt-1 w-full rounded-lg border border-black/10 bg-white shadow-lg">
            {suggestions.map((i) => (
              <button
                key={i.id}
                onClick={() => {
                  startTransition(() => addToWatchlist(i.id));
                  setQuery("");
                }}
                className="flex w-full items-center justify-between px-4 py-2 text-left text-sm hover:bg-brand-bg"
              >
                <span className="font-medium text-brand-navy">{i.symbol}</span>
                <span className="text-brand-navy/50">{i.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {watchlistItems.map((w) => (
          <div
            key={w.id}
            className="flex items-start justify-between rounded-xl border border-black/5 bg-white p-4"
          >
            <Link href={`/app/instruments/${encodeURIComponent(w.symbol)}`}>
              <p className="text-sm font-semibold text-brand-navy">{w.symbol}</p>
              <p className="mt-1 text-xs text-brand-navy/60">{w.name}</p>
            </Link>
            <button
              onClick={() => startTransition(() => removeFromWatchlist(w.id))}
              disabled={isPending}
              className="text-xs text-brand-navy/40 hover:text-brand-sell"
              aria-label={`Remove ${w.symbol} from watchlist`}
            >
              Remove
            </button>
          </div>
        ))}
        {watchlistItems.length === 0 && (
          <p className="col-span-full text-sm text-brand-navy/50">
            Your watchlist is empty. Search above to add instruments.
          </p>
        )}
      </div>
    </div>
  );
}
