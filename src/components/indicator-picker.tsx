"use client";

import { useEffect, useRef, useState } from "react";
import { INDICATOR_CATALOG, OSCILLATOR_KINDS } from "@/lib/strategy/indicator-catalog";
import type { IndicatorKind } from "@/lib/strategy/types";

/** "+ Add indicator" button + dropdown, scoped to either overlay (price-scale)
 * or oscillator (own-scale) indicators via `scope`, matching the split
 * `OSCILLATOR_KINDS` already defines for the strategy builder. */
export default function IndicatorPicker({
  label,
  scope,
  onAdd,
}: {
  label: string;
  scope: "overlay" | "oscillator";
  onAdd: (kind: IndicatorKind) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    // Focus the search box the moment the panel opens, matching a
    // TradingView-style "Indicators" search rather than a plain dropdown.
    const focusTimer = setTimeout(() => inputRef.current?.focus(), 0);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      clearTimeout(focusTimer);
    };
  }, [open]);

  const scoped = INDICATOR_CATALOG.filter((d) =>
    scope === "oscillator" ? OSCILLATOR_KINDS.has(d.kind) : !OSCILLATOR_KINDS.has(d.kind),
  );
  const q = query.trim().toLowerCase();
  const options = q ? scoped.filter((d) => d.label.toLowerCase().includes(q)) : scoped;

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-full border border-dashed border-brand-navy/25 px-3 py-1 text-xs font-medium text-brand-navy/60 hover:border-brand-primary hover:text-brand-primary"
      >
        + {label}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-56 overflow-hidden rounded-lg border border-black/10 bg-white shadow-lg">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${label.toLowerCase()}s…`}
            className="w-full border-b border-black/5 px-2.5 py-2 text-sm outline-none placeholder:text-brand-navy/35"
          />
          <div className="max-h-64 overflow-y-auto p-1.5">
            {options.length === 0 ? (
              <p className="px-2 py-3 text-center text-xs text-brand-navy/40">No match.</p>
            ) : (
              options.map((d) => (
                <button
                  key={d.kind}
                  type="button"
                  onClick={() => {
                    onAdd(d.kind);
                    setOpen(false);
                    setQuery("");
                  }}
                  className="block w-full rounded-md px-2 py-1.5 text-left text-sm text-brand-navy hover:bg-brand-bg"
                >
                  {d.label}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
