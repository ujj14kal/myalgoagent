"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import CandlestickChart from "@/components/candlestick-chart";
import OscillatorPanel from "@/components/oscillator-panel";
import InstrumentCombobox from "@/components/instrument-combobox";
import { previewCustomIndicator, saveCustomIndicator, type PreviewData } from "@/lib/custom-indicator-actions";
import { FORMULA_REFERENCE } from "@/lib/custom-indicator/formula";
import { CLASS_ABOUT, classifyCustom, type CustomClass, type CustomIndicatorDef } from "@/lib/custom-indicator";

/** The classes you can build here (trend lines and drawn channels are drawn on a chart instead). */
type Buildable = Exclude<CustomClass, "Trend line">;
const BUILDABLE: Buildable[] = ["Graph line", "Price overlay", "Signal markers", "Channel", "Band", "Horizontal level", "Zone", "Rectangle"];

type Example = { name: string; about: string; def: CustomIndicatorDef };
const EXAMPLES: Partial<Record<Buildable, Example[]>> = {
  "Graph line": [
    { name: "Trend strength", about: "How many ATRs price is above (+) or below (−) its 50-bar average.", def: { type: "formula", formula: "(close - sma(close, 50)) / atr(14)", pane: "separate" } },
    { name: "Volume surge", about: "Today's volume vs its 20-bar average (2 = double).", def: { type: "formula", formula: "volume / sma(volume, 20)", pane: "separate" } },
    { name: "Range position", about: "Where the close sits in the last 20 bars' range (0–100).", def: { type: "formula", formula: "(close - lowest(low, 20)) / (highest(high, 20) - lowest(low, 20)) * 100", pane: "separate" } },
  ],
  "Price overlay": [{ name: "Midline", about: "Middle of the 20-bar high–low range, drawn on price.", def: { type: "formula", formula: "(highest(high, 20) + lowest(low, 20)) / 2", pane: "price" } }],
  "Signal markers": [
    { name: "EMA cross up", about: "Marks each bar where the 20 EMA crosses above the 50 EMA.", def: { type: "signal", formula: "crossover(ema(close, 20), ema(close, 50))" } },
    { name: "Volume breakout", about: "Close at a 20-bar high on double the usual volume.", def: { type: "signal", formula: "close >= highest(high, 20) and volume > 2 * sma(volume, 20)" } },
  ],
  Channel: [{ name: "20-bar channel", about: "Highest high and lowest low of the last 20 bars.", def: { type: "channel", upper: "highest(high, 20)", lower: "lowest(low, 20)" } }],
  Band: [
    { name: "2σ band", about: "20-bar average ± 2 standard deviations (the Bollinger idea).", def: { type: "band", middle: "sma(close, 20)", width: "2 * stdev(close, 20)" } },
    { name: "ATR envelope", about: "20 EMA ± 2 ATRs (the Keltner idea).", def: { type: "band", middle: "ema(close, 20)", width: "2 * atr(10)" } },
  ],
};

const inputCls = "w-full rounded-lg border border-brand-navy/15 px-3 py-2 text-sm outline-none focus:border-brand-primary";
const IST = 19800;
const toDate = (t?: number) => (t ? new Date((t + IST) * 1000).toISOString().slice(0, 10) : "");
const fromDate = (d: string, endOfDay = false) => (d ? Math.floor(Date.parse(`${d}T${endOfDay ? "23:59:59" : "00:00:00"}+05:30`) / 1000) : undefined);

type Fields = { formula: string; upper: string; lower: string; middle: string; width: string; price: string; from: string; to: string; pane: "price" | "separate"; color: string };

function fieldsOf(def?: CustomIndicatorDef): Fields {
  const f: Fields = { formula: "", upper: "", lower: "", middle: "", width: "", price: "", from: "", to: "", pane: "separate", color: def?.color ?? "#7c3aed" };
  if (!def) return f;
  switch (def.type) {
    case "formula":
      return { ...f, formula: def.formula, pane: def.pane };
    case "signal":
      return { ...f, formula: def.formula };
    case "channel":
      return { ...f, upper: def.upper, lower: def.lower, middle: def.middle ?? "", pane: def.pane ?? "price" };
    case "band":
      return { ...f, middle: def.middle, width: def.width, pane: def.pane ?? "price" };
    case "level":
      return { ...f, price: String(def.price), from: toDate(def.from) };
    case "zone":
      return { ...f, upper: String(def.upper), lower: String(def.lower), from: toDate(def.from), to: toDate(def.to) };
    default:
      return f;
  }
}

/** The definition the form describes right now (validated on the server when previewed or saved). */
function defOf(kind: Buildable, f: Fields): CustomIndicatorDef {
  const color = { color: f.color };
  switch (kind) {
    case "Graph line":
    case "Price overlay":
      return { type: "formula", formula: f.formula, pane: kind === "Price overlay" ? "price" : "separate", ...color };
    case "Signal markers":
      return { type: "signal", formula: f.formula, ...color };
    case "Channel":
      return { type: "channel", upper: f.upper, lower: f.lower, ...(f.middle.trim() ? { middle: f.middle } : {}), pane: f.pane, ...color };
    case "Band":
      return { type: "band", middle: f.middle, width: f.width, pane: f.pane, ...color };
    case "Horizontal level":
      return { type: "level", price: Number(f.price), from: fromDate(f.from), ...color };
    case "Zone":
      return { type: "zone", upper: Number(f.upper), lower: Number(f.lower), from: fromDate(f.from), ...color };
    case "Rectangle":
      return { type: "zone", upper: Number(f.upper), lower: Number(f.lower), from: fromDate(f.from), to: fromDate(f.to, true), ...color };
  }
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-brand-navy/45">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-brand-navy/50">{hint}</span>}
    </label>
  );
}

export default function CustomIndicatorEditor({
  instruments,
  initial,
  onDone,
}: {
  instruments: { id: string; symbol: string; name: string }[];
  initial?: { id?: string; name: string; description: string | null; def: CustomIndicatorDef };
  onDone?: () => void;
}) {
  const startClass = initial ? classifyCustom(initial.def) : "Graph line";
  const [kind, setKind] = useState<Buildable>(startClass === "Trend line" ? "Graph line" : startClass);
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [f, setF] = useState<Fields>(() => fieldsOf(initial?.def));
  const set = (patch: Partial<Fields>) => setF((x) => ({ ...x, ...patch }));
  const [symbol, setSymbol] = useState(instruments.find((i) => i.symbol === "RELIANCE.NS")?.symbol ?? instruments[0]?.symbol ?? "");
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  const def = useMemo(() => defOf(kind, f), [kind, f]);
  const ready = (() => {
    switch (kind) {
      case "Graph line":
      case "Price overlay":
      case "Signal markers":
        return !!f.formula.trim();
      case "Channel":
        return !!f.upper.trim() && !!f.lower.trim();
      case "Band":
        return !!f.middle.trim() && !!f.width.trim();
      case "Horizontal level":
        return Number(f.price) > 0;
      case "Zone":
        return Number(f.upper) > 0 && Number(f.lower) > 0;
      case "Rectangle":
        return Number(f.upper) > 0 && Number(f.lower) > 0 && !!f.from && !!f.to;
    }
  })();

  const runPreview = () =>
    start(async () => {
      const r = await previewCustomIndicator(def, symbol, name);
      if (!r.ok) {
        setPreview(null);
        return setError(r.error);
      }
      setError(null);
      setPreview(r.data!);
    });

  const formulaBox = (key: "formula" | "upper" | "lower" | "middle" | "width", label: string, placeholder: string, hint?: string) => (
    <Field label={label} hint={hint}>
      <textarea value={f[key]} onChange={(e) => set({ [key]: e.target.value })} rows={key === "formula" ? 3 : 1} spellCheck={false} placeholder={placeholder} className={`${inputCls} font-mono`} />
    </Field>
  );
  const paneToggle = (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-brand-navy/55">Draw it</span>
      {(["price", "separate"] as const).map((p) => (
        <button key={p} type="button" onClick={() => set({ pane: p })} className={`rounded-full px-3 py-1 font-semibold ${f.pane === p ? "bg-brand-navy text-white" : "bg-white text-brand-navy/60 ring-1 ring-brand-navy/10"}`}>
          {p === "price" ? "On the price chart" : "In its own pane"}
        </button>
      ))}
    </div>
  );
  const visual = preview?.visual;
  const color = def.color ?? "#7c3aed";

  return (
    <div className="space-y-4">
      <div>
        <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-brand-navy/45">Kind of indicator</span>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Kind of indicator">
          {BUILDABLE.map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => (setKind(k), setPreview(null), setError(null))}
              className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${kind === k ? "bg-brand-navy text-white ring-brand-navy" : "text-brand-navy/65 ring-brand-navy/15"}`}
            >
              {k}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-brand-navy/55">{CLASS_ABOUT[kind]}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. My trend strength" className={inputCls} />
        </Field>
        <Field label="What it measures (optional)">
          <input value={description} onChange={(e) => setDescription(e.target.value)} className={inputCls} />
        </Field>
      </div>

      {(kind === "Graph line" || kind === "Price overlay") && formulaBox("formula", "Formula", "(ema(close, 20) - ema(close, 50)) / atr(14)")}
      {kind === "Signal markers" && formulaBox("formula", "Mark a bar when", "crossover(ema(close, 20), ema(close, 50))", "A true/false formula. Rules read it as 1 on bars where it's true, 0 otherwise.")}
      {kind === "Channel" && (
        <div className="grid gap-3 sm:grid-cols-3">
          {formulaBox("upper", "Upper line", "highest(high, 20)")}
          {formulaBox("lower", "Lower line", "lowest(low, 20)")}
          {formulaBox("middle", "Middle line (optional)", "halfway if left empty")}
        </div>
      )}
      {kind === "Band" && (
        <div className="grid gap-3 sm:grid-cols-2">
          {formulaBox("middle", "Middle line", "sma(close, 20)")}
          {formulaBox("width", "Width (added above, taken off below)", "2 * stdev(close, 20)")}
        </div>
      )}
      {(kind === "Channel" || kind === "Band") && paneToggle}
      {kind === "Horizontal level" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Price (₹)">
            <input type="number" min={0} step="any" value={f.price} onChange={(e) => set({ price: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Counts from (optional)" hint="Leave empty to apply on every bar, like a fixed number.">
            <input type="date" value={f.from} onChange={(e) => set({ from: e.target.value })} className={inputCls} />
          </Field>
        </div>
      )}
      {(kind === "Zone" || kind === "Rectangle") && (
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Upper edge (₹)">
            <input type="number" min={0} step="any" value={f.upper} onChange={(e) => set({ upper: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Lower edge (₹)">
            <input type="number" min={0} step="any" value={f.lower} onChange={(e) => set({ lower: e.target.value })} className={inputCls} />
          </Field>
          <Field label={kind === "Rectangle" ? "From" : "Counts from (optional)"}>
            <input type="date" value={f.from} onChange={(e) => set({ from: e.target.value })} className={inputCls} />
          </Field>
          {kind === "Rectangle" && (
            <Field label="Until">
              <input type="date" value={f.to} onChange={(e) => set({ to: e.target.value })} className={inputCls} />
            </Field>
          )}
        </div>
      )}
      {kind === "Rectangle" && <p className="text-[11px] text-brand-navy/50">Outside these dates the rectangle has no value, so rules using it can&apos;t trigger there. In a backtest it applies exactly as drawn, even on bars before you drew it — keep that in mind when reading results.</p>}

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="inline-flex items-center gap-1.5 text-xs text-brand-navy/55">
          Colour
          <input type="color" value={f.color} onChange={(e) => set({ color: e.target.value })} className="h-6 w-8 cursor-pointer rounded border border-brand-navy/15" />
        </label>
        <span className="ml-2 text-xs text-brand-navy/55">Preview on</span>
        <InstrumentCombobox className="w-56" options={instruments} valueKey="symbol" value={symbol} onChange={setSymbol} />
        <button type="button" disabled={pending || !ready} onClick={runPreview} className="rounded-full px-4 py-1.5 text-xs font-semibold text-brand-primary ring-1 ring-brand-primary/30 disabled:opacity-40">
          {pending ? "Working…" : "Preview"}
        </button>
      </div>
      {EXAMPLES[kind] && (
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES[kind]!.map((e) => (
            <button
              key={e.name}
              type="button"
              title={e.about}
              onClick={() => {
                setF((x) => ({ ...fieldsOf(e.def), color: x.color }));
                if (!name) setName(e.name);
                if (!description) setDescription(e.about);
              }}
              className="rounded-full border border-dashed border-brand-navy/20 px-3 py-1 text-xs text-brand-navy/65 hover:border-brand-primary"
            >
              {e.name}
            </button>
          ))}
        </div>
      )}

      {error && <p className="rounded-lg bg-brand-sell/5 px-3 py-2 text-sm text-brand-sell">{error}</p>}
      {preview && visual && (
        <div className="space-y-2">
          <CandlestickChart
            candles={preview.candles}
            overlays={visual.pane === "price" ? visual.lines.map((l) => ({ label: l.label, color, points: l.points, dashed: l.dashed })) : []}
            notes={visual.markers.map((time) => ({ time, text: name || "Signal", color }))}
          />
          {visual.pane === "separate" && visual.lines.length > 0 && <OscillatorPanel series={visual.lines.map((l) => ({ label: l.label, color, points: l.points }))} />}
          <p className="text-xs text-brand-navy/55">
            {kind === "Signal markers" ? (
              <>
                Marked {visual.markers.length} time{visual.markers.length === 1 ? "" : "s"} on {symbol.replace(/\.NS$/, "")} · latest bar reads <strong className="text-brand-navy">{preview.last ?? "—"}</strong>
              </>
            ) : (
              <>
                Latest {preview.lastLabel} on {symbol.replace(/\.NS$/, "")}: <strong className="text-brand-navy">{preview.last ?? "— (no value on the latest bar)"}</strong>
              </>
            )}{" "}
            · daily candles, last 6 months
          </p>
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending || !name.trim() || !ready}
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
