"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import CandlestickChart from "@/components/candlestick-chart";
import OscillatorPanel from "@/components/oscillator-panel";
import InstrumentCombobox from "@/components/instrument-combobox";
import { previewCustomIndicator, saveCustomIndicator, type PreviewData } from "@/lib/custom-indicator-actions";
import { FORMULA_REFERENCE } from "@/lib/custom-indicator/formula";

const EXAMPLES: { name: string; formula: string; pane: "price" | "separate"; about: string }[] = [
  { name: "Trend strength", formula: "(close - sma(close, 50)) / atr(14)", pane: "separate", about: "How many ATRs price is above (+) or below (−) its 50-bar average." },
  { name: "EMA spread %", formula: "(ema(close, 20) - ema(close, 50)) / close * 100", pane: "separate", about: "Gap between a fast and slow EMA, as % of price." },
  { name: "Volume surge", formula: "volume / sma(volume, 20)", pane: "separate", about: "Today's volume vs its 20-bar average (2 = double)." },
  { name: "Range position", formula: "(close - lowest(low, 20)) / (highest(high, 20) - lowest(low, 20)) * 100", pane: "separate", about: "Where the close sits in the last 20 bars' range (0–100)." },
  { name: "Midline", formula: "(highest(high, 20) + lowest(low, 20)) / 2", pane: "price", about: "Middle of the 20-bar high–low range, drawn on price." },
  { name: "Up-trend flag", formula: "ema(close, 20) > ema(close, 50) and close > vwap()", pane: "separate", about: "1 while the fast EMA is above the slow one and price is above VWAP, else 0." },
];

const inputCls = "w-full rounded-lg border border-brand-navy/15 px-3 py-2 text-sm outline-none focus:border-brand-primary";

export default function CustomIndicatorEditor({
  instruments,
  initial,
  onDone,
}: {
  instruments: { id: string; symbol: string; name: string }[];
  initial?: { id?: string; name: string; description: string | null; formula: string; pane: "price" | "separate" };
  onDone?: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [formula, setFormula] = useState(initial?.formula ?? "");
  const [pane, setPane] = useState<"price" | "separate">(initial?.pane ?? "separate");
  const [symbol, setSymbol] = useState(instruments.find((i) => i.symbol === "RELIANCE.NS")?.symbol ?? instruments[0]?.symbol ?? "");
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  const def = { type: "formula" as const, formula, pane };
  const runPreview = () =>
    start(async () => {
      const r = await previewCustomIndicator(def, symbol);
      if (!r.ok) {
        setPreview(null);
        return setError(r.error);
      }
      setError(null);
      setPreview(r.data!);
    });

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-brand-navy/45">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. My trend strength" className={inputCls} />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-brand-navy/45">What it measures (optional)</span>
          <input value={description} onChange={(e) => setDescription(e.target.value)} className={inputCls} />
        </label>
      </div>
      <label className="block">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-brand-navy/45">Formula</span>
        <textarea value={formula} onChange={(e) => setFormula(e.target.value)} rows={3} spellCheck={false} placeholder="(ema(close, 20) - ema(close, 50)) / atr(14)" className={`${inputCls} font-mono`} />
      </label>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-xs text-brand-navy/55">Draw it</span>
        {(["separate", "price"] as const).map((p) => (
          <button key={p} type="button" onClick={() => setPane(p)} className={`rounded-full px-3 py-1 text-xs font-semibold ${pane === p ? "bg-brand-navy text-white" : "bg-white text-brand-navy/60 ring-1 ring-brand-navy/10"}`}>
            {p === "price" ? "On the price chart" : "In its own pane"}
          </button>
        ))}
        <span className="ml-2 text-xs text-brand-navy/55">Preview on</span>
        <InstrumentCombobox className="w-56" options={instruments} valueKey="symbol" value={symbol} onChange={setSymbol} />
        <button type="button" disabled={pending || !formula.trim()} onClick={runPreview} className="rounded-full px-4 py-1.5 text-xs font-semibold text-brand-primary ring-1 ring-brand-primary/30 disabled:opacity-40">
          {pending ? "Working…" : "Preview"}
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {EXAMPLES.map((e) => (
          <button
            key={e.name}
            type="button"
            title={e.about}
            onClick={() => {
              setFormula(e.formula);
              setPane(e.pane);
              if (!name) setName(e.name);
              if (!description) setDescription(e.about);
            }}
            className="rounded-full border border-dashed border-brand-navy/20 px-3 py-1 text-xs text-brand-navy/65 hover:border-brand-primary"
          >
            {e.name}
          </button>
        ))}
      </div>

      {error && <p className="rounded-lg bg-brand-sell/5 px-3 py-2 text-sm text-brand-sell">{error}</p>}
      {preview && (
        <div className="space-y-2">
          <CandlestickChart candles={preview.candles} overlays={pane === "price" ? [{ label: name || "Custom", color: "#7c3aed", points: preview.values }] : []} />
          {pane === "separate" && <OscillatorPanel series={[{ label: name || "Custom", color: "#7c3aed", points: preview.values }]} />}
          <p className="text-xs text-brand-navy/55">
            Latest value on {symbol.replace(/\.NS$/, "")}: <strong className="text-brand-navy">{preview.last ?? "—"}</strong> · daily candles, last 6 months
          </p>
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending || !name.trim() || !formula.trim()}
          onClick={() =>
            start(async () => {
              const r = await saveCustomIndicator({ id: initial?.id, name, description, def });
              if (!r.ok) return setError(r.error);
              setError(null);
              setSaved(true);
              router.refresh();
              onDone?.();
            })
          }
          className="rounded-full bg-brand-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {initial?.id ? "Save changes" : "Save custom indicator"}
        </button>
        {onDone && (
          <button type="button" onClick={onDone} className="rounded-full px-4 py-2 text-sm font-semibold text-brand-navy/55">
            Cancel
          </button>
        )}
        {saved && !onDone && <span className="self-center text-sm text-[#0b6b30]">Saved — it&apos;s now in the Custom group of every indicator picker.</span>}
      </div>

      <details className="rounded-xl bg-brand-bg/70 p-3 text-xs text-brand-navy/70">
        <summary className="cursor-pointer font-semibold text-brand-navy">Everything a formula can use</summary>
        <p className="mt-2">
          <strong>Prices:</strong> {FORMULA_REFERENCE.series.join(", ")} · <strong>Maths:</strong> + − × / ^, comparisons &gt; &lt; &gt;= &lt;= == != (true = 1, false = 0), and / or
        </p>
        <p className="mt-1">
          <strong>On any series</strong> — fn(source, length): {FORMULA_REFERENCE.window.join(", ")}. ref(x, n) is x from n bars ago; change(x, n) and roc(x, n) are its change and % change.
        </p>
        <p className="mt-1">
          <strong>Other:</strong> abs(x), sqrt(x), log(x), min(a, b), max(a, b), if(condition, a, b), crossover(a, b), crossunder(a, b)
        </p>
        <p className="mt-1">
          <strong>Built-in indicators</strong> by name with their settings (defaults if left out):{" "}
          {FORMULA_REFERENCE.indicators.map((i) => `${i.name}(${i.settings.join(", ")})`).join(" · ")}
        </p>
      </details>
    </div>
  );
}
