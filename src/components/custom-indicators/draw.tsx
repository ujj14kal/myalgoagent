"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Minus, MoveUpRight, Save, TrendingUp, Undo2 } from "lucide-react";
import CandlestickChart from "@/components/candlestick-chart";
import InstrumentCombobox from "@/components/instrument-combobox";
import { saveCustomIndicator } from "@/lib/custom-indicator-actions";
import type { Drawing } from "@/lib/chart-drawing-primitive";
import type { Candle } from "@/lib/market-data";
import type { LinePoint } from "@/lib/custom-indicator";

type LineKind = "trendline" | "ray" | "horizontal";
type LineDrawing = Extract<Drawing, { kind: LineKind }>;

const TOOLS: { kind: LineKind; label: string; hint: string; icon: typeof TrendingUp }[] = [
  { kind: "trendline", label: "Trendline", hint: "Click two points — e.g. two swing lows for a rising support line.", icon: TrendingUp },
  { kind: "ray", label: "Ray", hint: "Click two points; the line keeps going to the right.", icon: MoveUpRight },
  { kind: "horizontal", label: "Level", hint: "Click once at the price you want to follow.", icon: Minus },
];

const TIMEFRAMES = [
  { value: "1d", range: "1y", label: "Daily (1 year)" },
  { value: "60m", range: "3mo", label: "1 hour (3 months)" },
  { value: "15m", range: "1mo", label: "15 min (1 month)" },
];

/** Draw a trendline, ray or level on a real chart and save it as a named custom indicator. */
export default function DrawIndicator({ instruments }: { instruments: { id: string; symbol: string; name: string }[] }) {
  const [symbol, setSymbol] = useState(instruments.find((i) => i.symbol === "RELIANCE.NS")?.symbol ?? instruments[0]?.symbol ?? "");
  const [tf, setTf] = useState(TIMEFRAMES[0]);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tool, setTool] = useState<LineKind | null>("trendline");
  const [drawings, setDrawings] = useState<LineDrawing[]>([]);
  const [names, setNames] = useState<Record<number, string>>({});
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
  const pointsOf = (d: LineDrawing): [LinePoint, LinePoint] => (d.kind === "horizontal" ? [{ time: latest, price: d.price }, { time: latest, price: d.price }] : [d.from, d.to]);
  const describe = (d: LineDrawing) => (d.kind === "horizontal" ? `Level at ₹${d.price.toFixed(2)}` : `${d.kind === "ray" ? "Ray" : "Trendline"} ₹${d.from.price.toFixed(2)} → ₹${d.to.price.toFixed(2)}`);
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
            if (d.kind === "trendline" || d.kind === "ray" || d.kind === "horizontal") setDrawings((all) => [...all, d]);
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
                placeholder={`Name, e.g. ${plain} ${d.kind === "horizontal" ? "support" : "uptrend"}`}
                className="min-w-48 flex-1 rounded-lg border border-brand-navy/15 px-2.5 py-1.5 text-sm"
              />
              <button
                type="button"
                disabled={pending || !(names[i] ?? "").trim()}
                onClick={() =>
                  start(async () => {
                    const name = (names[i] ?? "").trim();
                    const r = await saveCustomIndicator({ name, def: { type: "line", points: pointsOf(d), symbol } });
                    if (!r.ok) return setNote(r.error);
                    setNote(`Saved “${name}”. Use it in strategy rules, e.g. “close crosses above ${name}”, or show it on any ${plain} chart from the Custom menu.`);
                    setDrawings((all) => all.filter((_, j) => j !== i));
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
      <p className="text-[11px] text-brand-navy/45">A drawn line only counts from its later point onwards — backtests never use a line before you could have drawn it.</p>
    </div>
  );
}
