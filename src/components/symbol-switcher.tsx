"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface InstrumentOption {
  id: string;
  symbol: string;
  name: string;
}

/** A TradingView-style symbol quick-switcher — type to filter, pick one,
 * jump straight to its chart page. Previously the only way to change
 * instrument was leaving the chart entirely for the Market Data list. */
export default function SymbolSwitcher({
  currentSymbol,
  allInstruments,
}: {
  currentSymbol: string;
  allInstruments: InstrumentOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    const focusTimer = setTimeout(() => inputRef.current?.focus(), 0);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      clearTimeout(focusTimer);
    };
  }, [open]);

  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!q) return allInstruments.slice(0, 8);
    return allInstruments.filter((i) => i.symbol.toLowerCase().includes(q) || i.name.toLowerCase().includes(q)).slice(0, 8);
  }, [q, allInstruments]);

  function goTo(symbol: string) {
    setOpen(false);
    setQuery("");
    router.push(`/app/instruments/${encodeURIComponent(symbol)}`);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg border border-brand-navy/15 px-3 py-1.5 text-sm font-semibold text-brand-navy hover:border-brand-primary"
      >
        {currentSymbol}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="text-brand-navy/40">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-72 overflow-hidden rounded-lg border border-black/10 bg-white shadow-lg">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search symbol or name…"
            className="w-full border-b border-black/5 px-3 py-2 text-sm outline-none placeholder:text-brand-navy/35"
          />
          <div className="max-h-72 overflow-y-auto p-1">
            {results.length === 0 ? (
              <p className="px-2 py-3 text-center text-xs text-brand-navy/40">No match.</p>
            ) : (
              results.map((i) => (
                <button
                  key={i.id}
                  type="button"
                  onClick={() => goTo(i.symbol)}
                  className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-brand-bg ${
                    i.symbol === currentSymbol ? "bg-brand-primary/5 text-brand-primary" : "text-brand-navy"
                  }`}
                >
                  <span className="font-medium">{i.symbol}</span>
                  <span className="truncate pl-3 text-xs text-brand-navy/45">{i.name}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
