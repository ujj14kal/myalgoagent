"use client";

import { useEffect, useRef, useState } from "react";

interface Option {
  key: string;
  label: string;
}

/**
 * A closed-by-default checklist dropdown for option lists too long to lay
 * out as inline toggle pills without wrapping onto several lines and
 * pushing the chart down the page (the overlay/oscillator lists on the
 * instrument chart are 6 and 13 items respectively).
 */
export default function MultiSelectDropdown({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: readonly Option[];
  selected: Set<string>;
  onToggle: (key: string) => void;
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

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`rounded-full border px-3 py-1 text-xs font-medium ${
          selected.size > 0 ? "border-transparent bg-brand-primary text-white" : "border-brand-navy/15 text-brand-navy/60 hover:border-brand-primary"
        }`}
      >
        {label}
        {selected.size > 0 && ` (${selected.size})`}
        <span className="ml-1">▾</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 max-h-72 w-64 overflow-y-auto rounded-lg border border-black/10 bg-white p-1.5 shadow-lg">
          {options.map((o) => (
            <label
              key={o.key}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-brand-navy hover:bg-brand-bg"
            >
              <input
                type="checkbox"
                checked={selected.has(o.key)}
                onChange={() => onToggle(o.key)}
                className="accent-brand-primary"
              />
              {o.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
