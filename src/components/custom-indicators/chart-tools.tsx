"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PencilRuler, Save } from "lucide-react";
import { useCustomIndicators } from "./context";
import { saveCustomIndicator } from "@/lib/custom-indicator-actions";
import type { Drawing } from "@/lib/chart-drawing-primitive";
import { drawingDef } from "./draw";

/** "Custom ▾": toggle the user's custom indicators on this chart. */
export function CustomIndicatorToggle({ active, onToggle }: { active: string[]; onToggle: (name: string) => void }) {
  const customs = useCustomIndicators();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1 rounded-full border border-brand-navy/15 px-3 py-1 text-xs font-medium text-brand-navy/60 hover:border-brand-primary">
        <PencilRuler size={12} /> Custom{active.length ? ` (${active.length})` : ""}
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-64 rounded-xl border border-black/10 bg-white p-1.5 shadow-lg">
          {customs.length === 0 ? (
            <p className="px-2 py-2 text-xs text-brand-navy/55">
              No custom indicators yet.{" "}
              <Link href="/app/indicators" className="font-semibold text-brand-primary">
                Create one →
              </Link>
            </p>
          ) : (
            customs.map((c) => (
              <label key={c.name} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-brand-bg">
                <input type="checkbox" checked={active.includes(c.name)} onChange={() => onToggle(c.name)} />
                <span className="truncate">{c.name}</span>
              </label>
            ))
          )}
        </div>
      )}
    </div>
  );
}

type LineDrawing = Extract<Drawing, { kind: "trendline" } | { kind: "ray" } | { kind: "horizontal" } | { kind: "rectangle" }>;

/** Save a trendline, ray, level or zone drawn on this chart as a named custom indicator. */
export function SaveLineAsIndicator({ drawings, symbol, latestTime }: { drawings: Drawing[]; symbol: string; latestTime: number }) {
  const lines = drawings.filter((d): d is LineDrawing => d.kind === "trendline" || d.kind === "ray" || d.kind === "horizontal" || d.kind === "rectangle");
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  const router = useRouter();
  if (!lines.length) return null;
  const label = (d: LineDrawing, i: number) => (d.kind === "horizontal" ? `Level ₹${d.price.toFixed(2)}` : d.kind === "rectangle" ? `Zone ₹${Math.min(d.from.price, d.to.price).toFixed(2)}–₹${Math.max(d.from.price, d.to.price).toFixed(2)}` : `${d.kind === "ray" ? "Ray" : "Trendline"} ${i + 1}: ₹${d.from.price.toFixed(2)} → ₹${d.to.price.toFixed(2)}`);
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-black/5 px-3 py-2 text-xs">
      <span className="text-brand-navy/55">Save a line as a custom indicator:</span>
      {lines.map((d, i) => (
        <button
          key={i}
          type="button"
          disabled={pending}
          onClick={() => {
            const name = window.prompt("Name this indicator (it will appear under “Custom” everywhere)", d.kind === "horizontal" ? `${symbol.replace(/\.NS$/, "")} level ${d.price.toFixed(0)}` : `${symbol.replace(/\.NS$/, "")} ${d.kind === "rectangle" ? "zone" : "trendline"}`);
            if (!name) return;
            start(async () => {
              const r = await saveCustomIndicator({ name, def: drawingDef(d, latestTime, symbol) });
              setNote(r.ok ? `Saved “${name}”. Use it in strategy rules, e.g. “close crosses above ${name}”.` : r.error);
              if (r.ok) router.refresh();
            });
          }}
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold text-brand-primary ring-1 ring-brand-primary/25 disabled:opacity-40"
        >
          <Save size={11} /> {label(d, i)}
        </button>
      ))}
      {note && <span className="text-brand-navy/60">{note}</span>}
    </div>
  );
}
