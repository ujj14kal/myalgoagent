"use client";

import { useState, useTransition } from "react";
import { FlaskConical, ShieldAlert, ShieldCheck } from "lucide-react";
import { inspectCustomIndicator, type InspectData, type InspectInterval } from "@/lib/custom-indicator-actions";
import type { CustomIndicatorDef } from "@/lib/custom-indicator";

const INTERVALS: { value: InspectInterval; label: string }[] = [
  { value: "1d", label: "Daily (1 year)" },
  { value: "60m", label: "1 hour (3 months)" },
  { value: "15m", label: "15 minutes (1 month)" },
  { value: "5m", label: "5 minutes (5 days)" },
];
const CHIPS = ["RELIANCE.NS", "HDFCBANK.NS", "TCS.NS", "^NSEI"];
const fmt = (v: number | null) => (v === null ? "–" : v.toLocaleString("en-IN", { maximumFractionDigits: 4 }));
const when = (t: number, interval: string) =>
  new Date(t * 1000).toLocaleString("en-IN", interval === "1d" ? { day: "numeric", month: "short", year: "2-digit", timeZone: "Asia/Kolkata" } : { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

/** Tests one saved indicator on real candles: every value and named step, a repainting check, the timing of its parts and its cost. */
export default function InspectIndicator({ def }: { def: CustomIndicatorDef }) {
  const [open, setOpen] = useState(false);
  const [symbol, setSymbol] = useState("RELIANCE.NS");
  const [interval, setInterval] = useState<InspectInterval>("1d");
  const [data, setData] = useState<InspectData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = () =>
    start(async () => {
      const r = await inspectCustomIndicator({ def, symbol: symbol.trim().toUpperCase(), interval });
      if (!r.ok) return (setError(r.error), setData(null));
      setError(null);
      setData(r.data ?? null);
    });

  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-brand-primary ring-1 ring-brand-primary/25 hover:bg-brand-primary/[0.05]">
        <FlaskConical size={13} /> Test &amp; inspect
      </button>
    );
  const input = "rounded-lg border border-brand-navy/15 px-2.5 py-1.5 text-sm outline-none focus:border-brand-primary";
  return (
    <div className="mt-3 space-y-3 rounded-xl bg-brand-bg/60 p-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-brand-navy/45">Instrument</span>
          <input value={symbol} onChange={(e) => setSymbol(e.target.value)} className={`${input} w-36`} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-brand-navy/45">Candles</span>
          <select value={interval} onChange={(e) => setInterval(e.target.value as InspectInterval)} className={input}>
            {INTERVALS.map((i) => (
              <option key={i.value} value={i.value}>
                {i.label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" disabled={pending} onClick={run} className="rounded-full bg-brand-primary px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">
          {pending ? "Testing…" : "Run the test"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="px-2 py-2 text-xs font-semibold text-brand-navy/50">
          Close
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {CHIPS.map((c) => (
          <button key={c} type="button" onClick={() => setSymbol(c)} className="rounded-full border border-brand-navy/15 px-2.5 py-0.5 text-[11px] font-semibold text-brand-navy/60 hover:border-brand-primary">
            {c.replace(/\.NS$/, "")}
          </button>
        ))}
      </div>
      {error && <p className="text-sm text-brand-sell">{error}</p>}
      {data && (
        <div className="space-y-3 text-sm">
          <p className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs font-medium ${data.integrity.stable ? "bg-brand-buy/10 text-[#0b6b30]" : "bg-brand-sell/10 text-[#9b1111]"}`}>
            {data.integrity.stable ? <ShieldCheck size={15} className="mt-0.5 shrink-0" /> : <ShieldAlert size={15} className="mt-0.5 shrink-0" />}
            <span>{data.integrity.verdict}</span>
          </p>
          {data.integrity.changes.length > 0 && (
            <ul className="space-y-0.5 text-xs text-brand-navy/70">
              {data.integrity.changes.map((c) => (
                <li key={`${c.part}-${c.barIndex}`}>
                  {c.label} on {when(c.time, data.interval)}: {fmt(c.before)} when that was the latest candle, {fmt(c.after)} with later candles.
                </li>
              ))}
            </ul>
          )}
          {data.integrity.timing.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-5 text-xs text-brand-navy/65">
              {data.integrity.timing.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          )}
          <p className="text-xs text-brand-navy/55">
            {data.cost.summary} Worked out {data.bars.toLocaleString("en-IN")} candles in {data.computeMs} ms.
          </p>
          <div className="overflow-x-auto rounded-lg border border-black/[0.06] bg-white">
            <table className="w-full min-w-[480px] text-xs">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-brand-navy/45">
                  <th className="px-2 py-1.5 font-semibold">Candle</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Close</th>
                  {data.columns.map((c) => (
                    <th key={c.key} className={`px-2 py-1.5 text-right font-semibold ${c.kind === "step" ? "text-brand-navy/35" : ""}`}>
                      {c.kind === "step" ? `step: ${c.label}` : c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.times.map((t, i) => (
                  <tr key={t} className="border-t border-black/[0.04]">
                    <td className="whitespace-nowrap px-2 py-1">{when(t, data.interval)}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{fmt(data.closes[i])}</td>
                    {data.columns.map((c) => (
                      <td key={c.key} className="px-2 py-1 text-right tabular-nums">
                        {fmt(c.values[i])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-brand-navy/45">The latest {data.times.length} candles. A dash means the value isn&apos;t available yet (not enough earlier candles), never a made-up number.</p>
        </div>
      )}
    </div>
  );
}
