"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Minus, MoveUpRight, RectangleHorizontal, Save, TrendingUp, Undo2 } from "lucide-react";
import CandlestickChart from "@/components/candlestick-chart";
import InstrumentCombobox from "@/components/instrument-combobox";
import { saveCustomIndicator } from "@/lib/custom-indicator-actions";
import type { Drawing } from "@/lib/chart-drawing-primitive";
import type { Candle } from "@/lib/market-data";
import type { CustomIndicatorDef } from "@/lib/custom-indicator";

type LineKind = "trendline" | "ray" | "horizontal" | "rectangle";
type LineDrawing = Extract<Drawing, { kind: LineKind }>;

const TOOLS: { kind: LineKind; label: string; hint: string; icon: typeof TrendingUp }[] = [
  { kind: "trendline", label: "Trendline", hint: "Click two points — e.g. two swing lows for a rising support line.", icon: TrendingUp },
  { kind: "ray", label: "Ray", hint: "Click two points; the line keeps going to the right.", icon: MoveUpRight },
  { kind: "horizontal", label: "Level", hint: "Click once at the price you want to follow.", icon: Minus },
  { kind: "rectangle", label: "Zone", hint: "Drag a box over a price area — e.g. a demand zone. Choose below whether it extends right or stays between its edges.", icon: RectangleHorizontal },
];

const TIMEFRAMES = [
  { value: "1d", range: "1y", label: "Daily (1 year)" },
  { value: "60m", range: "3mo", label: "1 hour (3 months)" },
  { value: "15m", range: "1mo", label: "15 min (1 month)" },
];

const dropIndex =
  (i: number) =>
  <T,>(m: Record<number, T>): Record<number, T> =>
    Object.fromEntries(Object.entries(m).flatMap(([k, v]) => (Number(k) === i ? [] : [[Number(k) > i ? Number(k) - 1 : Number(k), v]])));

/** What a drawing saves as. A line with a parallel width is a channel; a box is a zone (extended right) or a rectangle (between its edges). */
export function drawingDef(d: LineDrawing, latest: number, symbol: string, opts: { offset?: number; boxOnly?: boolean } = {}): CustomIndicatorDef {
  if (d.kind === "horizontal") return { type: "level", price: d.price, from: latest, symbol };
  if (d.kind === "rectangle") {
    const [t1, t2] = [Math.min(d.from.time, d.to.time), Math.max(d.from.time, d.to.time)];
    const [upper, lower] = [Math.max(d.from.price, d.to.price), Math.min(d.from.price, d.to.price)];
    // Extended right, the zone only exists from its right edge — before that you hadn't drawn it yet.
    return opts.boxOnly ? { type: "zone", upper, lower, from: t1, to: t2, symbol } : { type: "zone", upper, lower, from: t2, symbol };
  }
  return { type: "line", points: [d.from, d.to], ...(opts.offset ? { offset: opts.offset } : {}), symbol };
}

/** Draw a trendline, ray, channel, level or zone on a real chart and save it as a named custom indicator. */
export default function DrawIndicator({ instruments }: { instruments: { id: string; symbol: string; name: string }[] }) {
  const [symbol, setSymbol] = useState(instruments.find((i) => i.symbol === "RELIANCE.NS")?.symbol ?? instruments[0]?.symbol ?? "");
  const [tf, setTf] = useState(TIMEFRAMES[0]);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tool, setTool] = useState<LineKind | null>("trendline");
  const [drawings, setDrawings] = useState<LineDrawing[]>([]);
  const [names, setNames] = useState<Record<number, string>>({});
  const [offsets, setOffsets] = useState<Record<number, string>>({});
  const [boxOnly, setBoxOnly] = useState<Record<number, boolean>>({});
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  useEffect(() => {
    if (!symbol) return;
    let cancelled = false;
    fetch(`/api/instruments/${encodeURIComponent(symbol)}/history?range=${tf.range}&interval=${tf.value}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.candles) {
          setCandles(d.candles);
          setError(null);
        } else setError(d.error ?? "Couldn't load prices.");
      })
      .catch(() => !cancelled && setError("Couldn't load prices."));
    return () => {
      cancelled = true;
    };
  }, [symbol, tf]);

  const latest = candles.at(-1)?.time ?? 0;
  const describe = (d: LineDrawing) =>
    d.kind === "horizontal"
      ? `Level at ₹${d.price.toFixed(2)}`
      : d.kind === "rectangle"
        ? `Zone ₹${Math.min(d.from.price, d.to.price).toFixed(2)}–₹${Math.max(d.from.price, d.to.price).toFixed(2)}`
        : `${d.kind === "ray" ? "Ray" : "Trendline"} ₹${d.from.price.toFixed(2)} → ₹${d.to.price.toFixed(2)}`;
  const plain = symbol.replace(/\.NS$/, "");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <InstrumentCombobox className="w-56" options={instruments} valueKey="symbol" value={symbol} onChange={(s) => (setSymbol(s), setDrawings([]))} />
        <select value={tf.value} onChange={(e) => (setTf(TIMEFRAMES.find((t) => t.value === e.target.value)!), setDrawings([]))} className="rounded-lg border border-brand-navy/15 px-2.5 py-1.5 text-sm">
          {TIMEFRAMES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <span className="mx-1 h-5 w-px bg-brand-navy/10" />
        {TOOLS.map((t) => (
          <button
            key={t.kind}
            type="button"
            onClick={() => setTool(tool === t.kind ? null : t.kind)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${tool === t.kind ? "bg-brand-primary text-white ring-brand-primary" : "text-brand-navy/65 ring-brand-navy/15"}`}
          >
            <t.icon size={13} /> {t.label}
          </button>
        ))}
        {drawings.length > 0 && (
          <button type="button" onClick={() => setDrawings((d) => d.slice(0, -1))} className="inline-flex items-center gap-1 text-xs text-brand-navy/50 hover:text-brand-sell">
            <Undo2 size={12} /> Undo
          </button>
        )}
      </div>
      <p className="text-xs text-brand-navy/55">{tool ? TOOLS.find((t) => t.kind === tool)!.hint : "Pick a tool above, then draw on the chart."}</p>
      {error ? (
        <p className="rounded-lg bg-brand-sell/5 px-3 py-2 text-sm text-brand-sell">{error}</p>
      ) : (
        <CandlestickChart
          candles={candles}
          drawings={drawings}
          activeTool={tool}
          onDrawingComplete={(d) => {
            if (d.kind === "trendline" || d.kind === "ray" || d.kind === "horizontal" || d.kind === "rectangle") setDrawings((all) => [...all, d]);
          }}
        />
      )}
      {drawings.length > 0 && (
        <ul className="space-y-2">
          {drawings.map((d, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2 rounded-xl bg-brand-bg/70 px-3 py-2 text-sm">
              <span className="text-brand-navy/70">{describe(d)}</span>
              <input
                value={names[i] ?? ""}
                onChange={(e) => setNames((n) => ({ ...n, [i]: e.target.value }))}
                placeholder={`Name, e.g. ${plain} ${d.kind === "horizontal" ? "support" : d.kind === "rectangle" ? "demand zone" : "uptrend"}`}
                className="min-w-48 flex-1 rounded-lg border border-brand-navy/15 px-2.5 py-1.5 text-sm"
              />
              {(d.kind === "trendline" || d.kind === "ray") && (
                <label className="inline-flex items-center gap-1 text-xs text-brand-navy/60" title="Adds a parallel line this many rupees above (+) or below (−), making a channel">
                  Parallel line ±₹
                  <input type="number" step="any" value={offsets[i] ?? ""} onChange={(e) => setOffsets((o) => ({ ...o, [i]: e.target.value }))} placeholder="none" className="w-20 rounded-lg border border-brand-navy/15 px-2 py-1 text-xs" />
                </label>
              )}
              {d.kind === "rectangle" && (
                <select value={boxOnly[i] ? "box" : "extend"} onChange={(e) => setBoxOnly((b) => ({ ...b, [i]: e.target.value === "box" }))} className="rounded-lg border border-brand-navy/15 px-2 py-1 text-xs" aria-label="How the zone applies">
                  <option value="extend">Extend right from its right edge</option>
                  <option value="box">Only between its edges (rectangle)</option>
                </select>
              )}
              <button
                type="button"
                disabled={pending || !(names[i] ?? "").trim()}
                onClick={() =>
                  start(async () => {
                    const name = (names[i] ?? "").trim();
                    const r = await saveCustomIndicator({ name, def: drawingDef(d, latest, symbol, { offset: Number(offsets[i]) || undefined, boxOnly: boxOnly[i] }) });
                    if (!r.ok) return setNote(r.error);
                    setNote(`Saved “${name}”. Use it in strategy rules, e.g. “close crosses above ${name}”, or show it on any ${plain} chart from the Custom menu.`);
                    setDrawings((all) => all.filter((_, j) => j !== i));
                    // Later rows move up one, so their typed names and settings move with them.
                    setNames(dropIndex(i));
                    setOffsets(dropIndex(i));
                    setBoxOnly(dropIndex(i));
                    router.refresh();
                  })
                }
                className="inline-flex items-center gap-1 rounded-full bg-brand-primary px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
              >
                <Save size={12} /> Save as indicator
              </button>
            </li>
          ))}
        </ul>
      )}
      {note && <p className="text-sm text-brand-navy/70">{note}</p>}
      <p className="text-[11px] text-brand-navy/45">
        A drawn line only counts from its later point onwards, a level from the latest bar, and an extended zone from its right edge — backtests never use them before you could have drawn them. A rectangle kept between its edges is the exception: it applies exactly as drawn.
      </p>
    </div>
  );
}
