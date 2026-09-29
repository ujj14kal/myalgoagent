"use client";

import { useId, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";

type Option = { id?: string; symbol: string; name: string };

const plain = (symbol: string) => symbol.replace(/\.NS$|\.BO$/, "");

/** Best matches for a query: exact symbol, then symbol prefix, then name prefix, then anywhere. */
export function rankInstruments<T extends Option>(options: T[], query: string, limit = 8): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return options.filter((o) => o.symbol.startsWith("^")).concat(options.filter((o) => !o.symbol.startsWith("^"))).slice(0, limit);
  const scored: { o: T; r: number }[] = [];
  for (const o of options) {
    const s = plain(o.symbol).replace(/^\^/, "").toLowerCase();
    const n = o.name.toLowerCase();
    const r = s === q ? 0 : s.startsWith(q) ? 1 : n.startsWith(q) ? 2 : s.includes(q) || n.includes(q) ? 3 : -1;
    if (r >= 0) scored.push({ o, r });
  }
  return scored.sort((a, b) => a.r - b.r || a.o.symbol.localeCompare(b.o.symbol)).slice(0, limit).map((x) => x.o);
}

/**
 * A type-to-search instrument picker — the platform lists 2,700+ instruments,
 * far too many for a plain <select>. `valueKey` says whether the value is the
 * instrument's id or its symbol; `emptyLabel` allows (and names) "none".
 */
export default function InstrumentCombobox({
  options,
  value,
  onChange,
  valueKey = "id",
  emptyLabel,
  placeholder = "Search symbol or company…",
  className = "",
  compact = false,
}: {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  valueKey?: "id" | "symbol";
  emptyLabel?: string;
  placeholder?: string;
  className?: string;
  compact?: boolean;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const keyOf = (o: Option) => (valueKey === "id" ? (o.id ?? o.symbol) : o.symbol);
  const selected = options.find((o) => keyOf(o) === value);
  const results = useMemo(() => rankInstruments(options, query), [options, query]);
  const items: (Option | null)[] = emptyLabel !== undefined && !query ? [null, ...results] : results;

  const pick = (o: Option | null) => {
    onChange(o ? keyOf(o) : "");
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
  };

  const label = selected ? (compact ? plain(selected.symbol) : `${plain(selected.symbol)} — ${selected.name}`) : (emptyLabel ?? "");

  return (
    <div className={`relative ${className}`}>
      <Search size={compact ? 12 : 14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-brand-navy/35" />
      <input
        ref={inputRef}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        value={open ? query : label}
        placeholder={open ? placeholder : (emptyLabel ?? placeholder)}
        onFocus={() => {
          setOpen(true);
          setActive(0);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, items.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter" && open && items.length) {
            e.preventDefault();
            pick(items[active] ?? null);
          } else if (e.key === "Escape") {
            setOpen(false);
            inputRef.current?.blur();
          }
        }}
        className={`w-full rounded-lg border border-brand-navy/15 bg-white outline-none focus:border-brand-primary ${compact ? "py-1 pl-7 pr-2 text-xs" : "py-2 pl-8 pr-3 text-sm"}`}
      />
      {open && (
        <ul id={listId} role="listbox" className="absolute z-30 mt-1 max-h-72 w-full min-w-[16rem] overflow-auto rounded-xl border border-black/10 bg-white py-1 shadow-lg">
          {items.length === 0 && <li className="px-3 py-2 text-xs text-brand-navy/45">No instrument matches “{query}”.</li>}
          {items.map((o, idx) => (
            <li
              key={o ? keyOf(o) : "__none"}
              role="option"
              aria-selected={idx === active}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(o);
              }}
              onMouseEnter={() => setActive(idx)}
              className={`cursor-pointer px-3 py-1.5 text-sm ${idx === active ? "bg-brand-primary/[0.07]" : ""}`}
            >
              {o ? (
                <>
                  <span className="font-semibold text-brand-navy">{plain(o.symbol)}</span> <span className="text-xs text-brand-navy/55">{o.name}</span>
                </>
              ) : (
                <span className="text-brand-navy/60">{emptyLabel}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
