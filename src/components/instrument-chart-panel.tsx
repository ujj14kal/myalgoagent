"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import CandlestickChart, { type Overlay, type ChartType } from "@/components/candlestick-chart";
import OscillatorPanel, { type OscillatorSeries } from "@/components/oscillator-panel";
import DrawingToolbar from "@/components/drawing-toolbar";
import IndicatorPicker from "@/components/indicator-picker";
import type { Drawing } from "@/lib/chart-drawing-primitive";
import { saveChartLayout } from "@/lib/chart-layout-actions";
import { RANGES, INTERVALS, isValidCombo, defaultIntervalForRange } from "@/lib/market-data";
import type { Candle, CandleInterval, CandleRange } from "@/lib/market-data";
import { computeIndicatorSeries } from "@/lib/strategy/compute-series";
import { INDICATOR_BY_KIND } from "@/lib/strategy/indicator-catalog";
import type { IndicatorKind } from "@/lib/strategy/types";
import { instanceFromDefaults, type ActiveIndicatorInstance } from "@/lib/chart-indicator-instance";

interface InstrumentOption {
  id: string;
  symbol: string;
  name: string;
}

// Kinds whose series is more legible as bars than a line.
const HISTOGRAM_KINDS = new Set<IndicatorKind>(["MACD_HISTOGRAM", "AWESOME_OSCILLATOR"]);

const OVERLAY_COLORS = ["#bda360", "#466fff", "#6a35c2", "#0e1b2d"];

const CHART_TYPES: { value: ChartType; label: string }[] = [
  { value: "candlestick", label: "Candles" },
  { value: "line", label: "Line" },
  { value: "area", label: "Area" },
  { value: "bar", label: "Bar" },
];

interface SavedConfig {
  chartType: ChartType;
  interval: CandleInterval;
  overlays: ActiveIndicatorInstance[];
  oscillators: ActiveIndicatorInstance[];
  showVolume: boolean;
  drawings: Drawing[];
  compareSymbol: string | null;
}

function pctChangeSeries(candles: Candle[]) {
  const base = candles[0]?.close;
  if (!base) return [];
  return candles.map((c) => ({ time: c.time, value: ((c.close - base) / base) * 100 }));
}

function IndicatorChip({
  instance,
  onChange,
  onRemove,
}: {
  instance: ActiveIndicatorInstance;
  onChange: (params: number[]) => void;
  onRemove: () => void;
}) {
  const def = INDICATOR_BY_KIND.get(instance.kind);
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-brand-navy/15 bg-brand-bg px-2 py-1 text-xs">
      <span className="font-medium text-brand-navy">{def?.label ?? instance.kind}</span>
      {def?.paramLabels.map((paramLabel, i) => (
        <input
          key={paramLabel + i}
          type="number"
          min={0}
          step="any"
          value={instance.params[i]}
          title={paramLabel}
          aria-label={paramLabel}
          onChange={(e) => {
            const params = instance.params.slice();
            params[i] = Number(e.target.value);
            onChange(params);
          }}
          className="w-12 rounded border border-brand-navy/15 bg-white px-1 py-0.5 text-xs outline-none focus:border-brand-primary"
        />
      ))}
      <button type="button" onClick={onRemove} className="text-brand-navy/40 hover:text-brand-sell" aria-label={`Remove ${def?.label ?? instance.kind}`}>
        ×
      </button>
    </div>
  );
}

export default function InstrumentChartPanel({
  instrumentId,
  symbol,
  candles: initialCandles,
  allInstruments,
  savedLayout,
}: {
  instrumentId: string;
  symbol: string;
  candles: Candle[];
  allInstruments: InstrumentOption[];
  savedLayout: SavedConfig | null;
}) {
  const [range, setRange] = useState<CandleRange>("6mo");
  const [interval, setIntervalValue] = useState<CandleInterval>(savedLayout?.interval ?? "1d");
  const [error, setError] = useState<string | null>(null);

  // Clicking a Range preset always jumps to that range's recommended
  // interval — e.g. "1D" switches to 5-minute bars and "5Y" to weekly ones
  // — the same behavior as TradingView's own bottom range selector.
  // Without this, an interval that's technically servable for the new
  // range but nonsensical for it (daily bars for a 1-day window render as
  // a single giant candle; daily bars for 5 years render a wall of
  // hundreds of bars) would otherwise stick around untouched, since
  // isValidCombo only blocks combos the upstream feed can't serve at all,
  // not ones that are merely a bad default. A user can still pick a
  // different interval afterward via the Interval row above — that's a
  // deliberate override, not the range picker fighting them.
  function handleRangeChange(next: CandleRange) {
    setRange(next);
    setIntervalValue(defaultIntervalForRange(next));
  }
  const [candles, setCandles] = useState<Candle[]>(initialCandles);
  const [loading, setLoading] = useState(false);
  const [chartType, setChartType] = useState<ChartType>(savedLayout?.chartType ?? "candlestick");
  const [overlayInstances, setOverlayInstances] = useState<ActiveIndicatorInstance[]>(
    savedLayout?.overlays ?? [instanceFromDefaults("SMA")],
  );
  const [oscillatorInstances, setOscillatorInstances] = useState<ActiveIndicatorInstance[]>(
    savedLayout?.oscillators ?? [],
  );
  const [showVolume, setShowVolume] = useState(savedLayout?.showVolume ?? false);
  const [drawings, setDrawings] = useState<Drawing[]>(savedLayout?.drawings ?? []);
  const [activeTool, setActiveTool] = useState<Drawing["kind"] | null>(null);
  const [compareSymbol, setCompareSymbol] = useState<string | null>(savedLayout?.compareSymbol ?? null);
  const [compareCandles, setCompareCandles] = useState<Candle[] | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved">("idle");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (range === "6mo" && interval === "1d" && candles === initialCandles) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- kicks off a loading indicator for the fetch below, not derived state
    setLoading(true);
    setError(null);
    fetch(`/api/instruments/${encodeURIComponent(symbol)}/history?range=${range}&interval=${interval}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.candles) setCandles(data.candles);
        else if (data.error) setError(data.error);
      })
      .catch(() => !cancelled && setError("Failed to load market data."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, interval, symbol]);

  useEffect(() => {
    if (!compareSymbol) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing compare data when the user turns compare off
      setCompareCandles(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/instruments/${encodeURIComponent(compareSymbol)}/history?range=${range}&interval=${interval}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data.candles) setCompareCandles(data.candles);
      });
    return () => {
      cancelled = true;
    };
  }, [compareSymbol, range, interval]);

  const overlays: Overlay[] = useMemo(() => {
    return overlayInstances.map((inst, idx) => {
      const def = INDICATOR_BY_KIND.get(inst.kind);
      const paramsLabel = inst.params.length > 0 ? ` (${inst.params.join(", ")})` : "";
      return {
        label: `${def?.label ?? inst.kind}${paramsLabel}`,
        color: OVERLAY_COLORS[idx % OVERLAY_COLORS.length],
        points: computeIndicatorSeries(candles, inst.kind, inst.params),
      };
    });
  }, [overlayInstances, candles]);

  const oscillatorPanels = useMemo(() => {
    return oscillatorInstances.map((inst): { key: string; label: string; series: OscillatorSeries[]; referenceLines?: number[] } => {
      const def = INDICATOR_BY_KIND.get(inst.kind);
      const paramsLabel = inst.params.length > 0 ? ` (${inst.params.join(", ")})` : "";
      return {
        key: inst.id,
        label: `${def?.label ?? inst.kind}${paramsLabel}`,
        series: [
          {
            label: def?.label ?? inst.kind,
            color: "#466fff",
            points: computeIndicatorSeries(candles, inst.kind, inst.params),
            type: HISTOGRAM_KINDS.has(inst.kind) ? "histogram" : "line",
          },
        ],
      };
    });
  }, [oscillatorInstances, candles]);

  const comparePanel: OscillatorSeries[] | null = useMemo(() => {
    if (!compareSymbol || !compareCandles) return null;
    return [
      { label: symbol, color: "#471898", points: pctChangeSeries(candles) },
      { label: compareSymbol, color: "#bda360", points: pctChangeSeries(compareCandles) },
    ];
  }, [compareSymbol, compareCandles, candles, symbol]);

  function addOverlay(kind: IndicatorKind) {
    setOverlayInstances((prev) => [...prev, instanceFromDefaults(kind)]);
  }

  function updateOverlay(id: string, params: number[]) {
    setOverlayInstances((prev) => prev.map((inst) => (inst.id === id ? { ...inst, params } : inst)));
  }

  function removeOverlay(id: string) {
    setOverlayInstances((prev) => prev.filter((inst) => inst.id !== id));
  }

  function addOscillator(kind: IndicatorKind) {
    setOscillatorInstances((prev) => [...prev, instanceFromDefaults(kind)]);
  }

  function updateOscillator(id: string, params: number[]) {
    setOscillatorInstances((prev) => prev.map((inst) => (inst.id === id ? { ...inst, params } : inst)));
  }

  function removeOscillator(id: string) {
    setOscillatorInstances((prev) => prev.filter((inst) => inst.id !== id));
  }

  function handleDrawingComplete(drawing: Drawing) {
    setDrawings((prev) => [...prev, drawing]);
    setActiveTool(null);
  }

  function handleSaveLayout() {
    startTransition(async () => {
      await saveChartLayout(instrumentId, {
        chartType,
        interval,
        overlays: overlayInstances,
        oscillators: oscillatorInstances,
        showVolume,
        drawings,
        compareSymbol,
      });
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    });
  }

  return (
    <div>
      {/* Everything lives in one card, wrapped tightly around the chart —
          interval + chart-type + tool controls above, drawing tools as a
          vertical rail beside the plot, the range strip directly under it. */}
      <div className="overflow-hidden rounded-2xl border border-black/5 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/5 p-3">
          <div className="flex flex-wrap items-center gap-2">
            {INTERVALS.map((iv) => {
              const disabled = !isValidCombo(range, iv.value);
              return (
                <button
                  key={iv.value}
                  disabled={disabled}
                  title={disabled ? `Not available for the "${range}" range` : undefined}
                  onClick={() => setIntervalValue(iv.value)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${
                    disabled
                      ? "cursor-not-allowed border-brand-navy/10 text-brand-navy/25"
                      : interval === iv.value
                        ? "border-transparent bg-brand-blue text-white"
                        : "border-brand-navy/15 text-brand-navy/60 hover:border-brand-primary"
                  }`}
                >
                  {iv.label}
                </button>
              );
            })}
            {loading && <span className="text-xs text-brand-navy/40">Loading…</span>}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {CHART_TYPES.map((t) => (
              <button
                key={t.value}
                onClick={() => setChartType(t.value)}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  chartType === t.value ? "border-transparent bg-brand-navy text-white" : "border-brand-navy/15 text-brand-navy/60 hover:border-brand-primary"
                }`}
              >
                {t.label}
              </button>
            ))}
            <button
              onClick={() => setShowVolume((v) => !v)}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                showVolume ? "border-transparent bg-brand-gold text-white" : "border-brand-navy/15 text-brand-navy/60 hover:border-brand-primary"
              }`}
            >
              Volume
            </button>
            <span className="mx-1 h-4 w-px bg-brand-navy/10" />
            <IndicatorPicker label="Overlay" scope="overlay" onAdd={addOverlay} />
            <IndicatorPicker label="Oscillator" scope="oscillator" onAdd={addOscillator} />
            <select
              value={compareSymbol ?? ""}
              onChange={(e) => setCompareSymbol(e.target.value || null)}
              className="rounded-lg border border-brand-navy/15 px-3 py-1.5 text-xs outline-none focus:border-brand-primary"
            >
              <option value="">Compare to…</option>
              {allInstruments.filter((i) => i.symbol !== symbol).map((i) => (
                <option key={i.id} value={i.symbol}>
                  {i.symbol}
                </option>
              ))}
            </select>
            <button
              onClick={handleSaveLayout}
              disabled={isPending}
              className="rounded-full bg-brand-primary px-4 py-1.5 text-xs font-medium text-white hover:bg-brand-primary-light disabled:opacity-50"
            >
              {isPending ? "Saving…" : saveStatus === "saved" ? "Saved ✓" : "Save layout"}
            </button>
          </div>
        </div>

        {(overlayInstances.length > 0 || oscillatorInstances.length > 0) && (
          <div className="flex flex-wrap items-center gap-1.5 border-b border-black/5 px-3 py-2">
            {overlayInstances.map((inst) => (
              <IndicatorChip key={inst.id} instance={inst} onChange={(params) => updateOverlay(inst.id, params)} onRemove={() => removeOverlay(inst.id)} />
            ))}
            {oscillatorInstances.map((inst) => (
              <IndicatorChip key={inst.id} instance={inst} onChange={(params) => updateOscillator(inst.id, params)} onRemove={() => removeOscillator(inst.id)} />
            ))}
          </div>
        )}

        {error && (
          <p className="border-b border-black/5 bg-brand-sell/5 px-3 py-2 text-xs text-brand-sell">{error}</p>
        )}

        <div className="flex">
          <DrawingToolbar activeTool={activeTool} onSelectTool={setActiveTool} drawingsCount={drawings.length} onClear={() => setDrawings([])} />
          <div className="min-w-0 flex-1 p-3">
            <CandlestickChart
              candles={candles}
              overlays={overlays}
              chartType={chartType}
              showVolume={showVolume}
              drawings={drawings}
              activeTool={activeTool}
              onDrawingComplete={handleDrawingComplete}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-black/5 p-3">
          {RANGES.map((r) => (
            <button
              key={r.value}
              onClick={() => handleRangeChange(r.value)}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                range === r.value ? "border-transparent bg-brand-primary text-white" : "border-brand-navy/15 text-brand-navy/60 hover:border-brand-primary"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {oscillatorPanels.map((panel) => (
        <div key={panel.key} className="mt-4 rounded-2xl border border-black/5 bg-white p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-navy/40">{panel.label}</p>
          <OscillatorPanel series={panel.series} referenceLines={panel.referenceLines} />
        </div>
      ))}

      {comparePanel && (
        <div className="mt-4 rounded-2xl border border-black/5 bg-white p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-navy/40">
            Compare — % change from range start
          </p>
          <OscillatorPanel series={comparePanel} referenceLines={[0]} />
        </div>
      )}
    </div>
  );
}
