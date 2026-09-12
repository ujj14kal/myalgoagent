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
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const options = INDICATOR_CATALOG.filter((d) =>
    scope === "oscillator" ? OSCILLATOR_KINDS.has(d.kind) : !OSCILLATOR_KINDS.has(d.kind),
  );

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
        <div className="absolute left-0 top-full z-20 mt-1 max-h-72 w-56 overflow-y-auto rounded-lg border border-black/10 bg-white p-1.5 shadow-lg">
          {options.map((d) => (
            <button
              key={d.kind}
              type="button"
              onClick={() => {
                onAdd(d.kind);
                setOpen(false);
              }}
              className="block w-full rounded-md px-2 py-1.5 text-left text-sm text-brand-navy hover:bg-brand-bg"
            >
              {d.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
