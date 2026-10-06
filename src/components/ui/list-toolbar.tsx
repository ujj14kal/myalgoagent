"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search, X } from "lucide-react";

// Search, filters and sort for a server-paged list. Every setting lives in the URL (so it survives
// a reload, the back button and sharing the link), changing one goes back to page 1, and the
// page size and any other settings are kept. Works as a plain form without JavaScript too.

export type ToolbarSelect = { name: string; label: string; options: { value: string; label: string }[] };

export default function ListToolbar({
  params,
  search,
  selects = [],
  basePath,
  pageKey = "page",
}: {
  /** The list's current settings (search, filters, sort, tab, size). */
  params: Record<string, string | undefined>;
  search?: { name?: string; placeholder: string };
  selects?: ToolbarSelect[];
  basePath?: string;
  /** The query name of this list's page (reset to 1 when a setting changes). */
  pageKey?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const path = basePath ?? pathname;
  const qName = search?.name ?? "q";
  const [text, setText] = useState(params[qName] ?? "");
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the box in step when the URL changes elsewhere (back button, Clear).
  // eslint-disable-next-line react-hooks/set-state-in-effect -- mirror the URL into the input
  useEffect(() => setText(params[qName] ?? ""), [params, qName]);

  const go = (over: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...params, ...over, [pageKey]: undefined })) if (v) q.set(k, v);
    const s = q.toString();
    start(() => router.push(s ? `${path}?${s}` : path, { scroll: false }));
  };
  const onType = (v: string) => {
    setText(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => go({ [qName]: v.trim() || undefined }), 400);
  };
  const filtered = selects.some((s) => params[s.name] && params[s.name] !== s.options[0]?.value) || !!params[qName];

  return (
    <form
      action={path}
      onSubmit={(e) => {
        e.preventDefault();
        if (timer.current) clearTimeout(timer.current);
        go({ [qName]: text.trim() || undefined });
      }}
      className={`flex flex-wrap items-center gap-2 text-xs ${pending ? "opacity-70" : ""}`}
      role="search"
    >
      {Object.entries(params)
        .filter(([k, v]) => v && k !== qName && k !== pageKey && !selects.some((s) => s.name === k))
        .map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
      {search && (
        <label className="relative flex min-w-[12rem] flex-1 items-center sm:max-w-xs">
          <Search size={13} className="pointer-events-none absolute left-2.5 text-brand-navy/40" />
          <input
            name={qName}
            value={text}
            onChange={(e) => onType(e.target.value)}
            placeholder={search.placeholder}
            aria-label={search.placeholder}
            className="w-full rounded-full border border-brand-navy/15 bg-white py-1.5 pl-7 pr-3 text-xs outline-none focus:border-brand-primary"
          />
        </label>
      )}
      {selects.map((s) => (
        <label key={s.name} className="flex items-center gap-1.5 text-brand-navy/55">
          <span className="whitespace-nowrap">{s.label}</span>
          <select
            name={s.name}
            value={params[s.name] ?? s.options[0]?.value ?? ""}
            onChange={(e) => go({ [s.name]: e.target.value === s.options[0]?.value ? undefined : e.target.value })}
            className="rounded-full border border-brand-navy/15 bg-white px-2.5 py-1.5 text-xs text-brand-navy"
          >
            {s.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      ))}
      <noscript>
        <button type="submit" className="rounded-full px-3 py-1.5 font-semibold text-brand-primary ring-1 ring-brand-primary/30">
          Apply
        </button>
      </noscript>
      {filtered && (
        <button
          type="button"
          onClick={() => go(Object.fromEntries([qName, ...selects.map((s) => s.name)].map((k) => [k, undefined])))}
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 font-semibold text-brand-navy/55 hover:text-brand-sell"
        >
          <X size={12} /> Clear
        </button>
      )}
    </form>
  );
}
