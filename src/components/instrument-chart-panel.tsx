"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import CandlestickChart, { type Overlay, type ChartType } from "@/components/candlestick-chart";
import OscillatorPanel, { type OscillatorSeries } from "@/components/oscillator-panel";
import DrawingToolbar from "@/components/drawing-toolbar";
import type { Drawing } from "@/lib/chart-drawing-primitive";
import MultiSelectDropdown from "@/components/multi-select-dropdown";
import { saveChartLayout } from "@/lib/chart-layout-actions";
import { RANGES, INTERVALS, isValidCombo, defaultIntervalForRange } from "@/lib/market-data";
import type { Candle, CandleInterval, CandleRange } from "@/lib/market-data";
import {
  sma,
  ema,
  rsi,
  macd,
  bollingerBands,
  vwap,
  atr,
  adx,
  stochastic,
  cci,
  roc,
  obv,
  donchianChannels,
  pivotPoints,
  williamsR,
  mfi,
  awesomeOscillator,
  aroon,
  chaikinMoneyFlow,
} from "@/lib/indicators";

interface InstrumentOption {
  id: string;
  symbol: string;
  name: string;
}

const OVERLAY_OPTIONS = [
  { key: "sma20", label: "SMA (20)" },
  { key: "ema50", label: "EMA (50)" },
  { key: "bollinger", label: "Bollinger Bands (20, 2)" },
  { key: "vwap", label: "VWAP" },
  { key: "donchian", label: "Donchian Channels (20)" },
  { key: "pivots", label: "Pivot Points" },
] as const;

const OSCILLATOR_OPTIONS = [
  { key: "rsi", label: "RSI (14)" },
  { key: "macd", label: "MACD (12, 26, 9)" },
  { key: "atr", label: "ATR (14)" },
  { key: "adx", label: "ADX / DMI (14)" },
  { key: "stochastic", label: "Stochastic (14, 3)" },
  { key: "cci", label: "CCI (20)" },
  { key: "roc", label: "ROC (12)" },
  { key: "obv", label: "OBV" },
  { key: "williamsR", label: "Williams %R (14)" },
  { key: "mfi", label: "MFI (14)" },
  { key: "awesomeOscillator", label: "Awesome Oscillator" },
  { key: "aroon", label: "Aroon (25)" },
  { key: "chaikinMoneyFlow", label: "Chaikin Money Flow (20)" },
] as const;

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
  overlays: string[];
  oscillators: string[];
  showVolume: boolean;
  drawings: Drawing[];
  compareSymbol: string | null;
}

function pctChangeSeries(candles: Candle[]) {
  const base = candles[0]?.close;
  if (!base) return [];
  return candles.map((c) => ({ time: c.time, value: ((c.close - base) / base) * 100 }));
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
  const [overlayKeys, setOverlayKeys] = useState<Set<string>>(new Set(savedLayout?.overlays ?? ["sma20"]));
  const [oscillatorKeys, setOscillatorKeys] = useState<Set<string>>(new Set(savedLayout?.oscillators ?? []));
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
    const out: Overlay[] = [];
    let colorIdx = 0;
    const nextColor = () => OVERLAY_COLORS[colorIdx++ % OVERLAY_COLORS.length];

    if (overlayKeys.has("sma20")) out.push({ label: "SMA (20)", color: nextColor(), points: sma(candles, 20) });
    if (overlayKeys.has("ema50")) out.push({ label: "EMA (50)", color: nextColor(), points: ema(candles, 50) });
    if (overlayKeys.has("bollinger")) {
      const bb = bollingerBands(candles, 20, 2);
      const c = nextColor();
      out.push({ label: "BB Upper", color: c, points: bb.upper });
      out.push({ label: "BB Middle", color: c, points: bb.middle });
      out.push({ label: "BB Lower", color: c, points: bb.lower });
    }
    if (overlayKeys.has("vwap")) out.push({ label: "VWAP", color: nextColor(), points: vwap(candles) });
    if (overlayKeys.has("donchian")) {
      const dc = donchianChannels(candles, 20);
      const c = nextColor();
      out.push({ label: "Donchian Upper", color: c, points: dc.upper });
      out.push({ label: "Donchian Lower", color: c, points: dc.lower });
    }
    if (overlayKeys.has("pivots")) {
      const pv = pivotPoints(candles);
      const c = nextColor();
      out.push({ label: "Pivot", color: c, points: pv.pp });
      out.push({ label: "R1", color: c, points: pv.r1 });
      out.push({ label: "S1", color: c, points: pv.s1 });
    }
    return out;
  }, [overlayKeys, candles]);

  const oscillatorPanels = useMemo(() => {
    const panels: { key: string; label: string; series: OscillatorSeries[]; referenceLines?: number[] }[] = [];

    if (oscillatorKeys.has("rsi")) {
      panels.push({ key: "rsi", label: "RSI (14) — 70 overbought / 30 oversold", series: [{ label: "RSI", color: "#466fff", points: rsi(candles, 14) }], referenceLines: [70, 30] });
    }
    if (oscillatorKeys.has("macd")) {
      const m = macd(candles);
      panels.push({
        key: "macd",
        label: "MACD (12, 26, 9)",
        series: [
          { label: "MACD", color: "#471898", points: m.macd },
          { label: "Signal", color: "#d60000", points: m.signal },
          { label: "Histogram", color: "#bda360", points: m.histogram, type: "histogram" },
        ],
      });
    }
    if (oscillatorKeys.has("atr")) panels.push({ key: "atr", label: "ATR (14)", series: [{ label: "ATR", color: "#466fff", points: atr(candles, 14) }] });
    if (oscillatorKeys.has("adx")) {
      const a = adx(candles, 14);
      panels.push({
        key: "adx",
        label: "ADX / DMI (14)",
        series: [
          { label: "ADX", color: "#471898", points: a.adx },
          { label: "+DI", color: "#00a83e", points: a.plusDI },
          { label: "-DI", color: "#d60000", points: a.minusDI },
        ],
      });
    }
    if (oscillatorKeys.has("stochastic")) {
      const s = stochastic(candles, 14, 3);
      panels.push({
        key: "stochastic",
        label: "Stochastic (14, 3) — 80 overbought / 20 oversold",
        series: [
          { label: "%K", color: "#466fff", points: s.k },
          { label: "%D", color: "#d60000", points: s.d },
        ],
        referenceLines: [80, 20],
      });
    }
    if (oscillatorKeys.has("cci")) panels.push({ key: "cci", label: "CCI (20)", series: [{ label: "CCI", color: "#466fff", points: cci(candles, 20) }], referenceLines: [100, -100] });
    if (oscillatorKeys.has("roc")) panels.push({ key: "roc", label: "ROC (12)", series: [{ label: "ROC", color: "#466fff", points: roc(candles, 12) }] });
    if (oscillatorKeys.has("obv")) panels.push({ key: "obv", label: "On-Balance Volume", series: [{ label: "OBV", color: "#466fff", points: obv(candles) }] });
    if (oscillatorKeys.has("williamsR")) panels.push({ key: "williamsR", label: "Williams %R (14)", series: [{ label: "%R", color: "#466fff", points: williamsR(candles, 14) }], referenceLines: [-20, -80] });
    if (oscillatorKeys.has("mfi")) panels.push({ key: "mfi", label: "MFI (14) — 80 overbought / 20 oversold", series: [{ label: "MFI", color: "#466fff", points: mfi(candles, 14) }], referenceLines: [80, 20] });
    if (oscillatorKeys.has("awesomeOscillator")) panels.push({ key: "awesomeOscillator", label: "Awesome Oscillator", series: [{ label: "AO", color: "#bda360", points: awesomeOscillator(candles), type: "histogram" }] });
    if (oscillatorKeys.has("aroon")) {
      const a = aroon(candles, 25);
      panels.push({ key: "aroon", label: "Aroon (25)", series: [{ label: "Up", color: "#00a83e", points: a.up }, { label: "Down", color: "#d60000", points: a.down }] });
    }
    if (oscillatorKeys.has("chaikinMoneyFlow")) panels.push({ key: "chaikinMoneyFlow", label: "Chaikin Money Flow (20)", series: [{ label: "CMF", color: "#466fff", points: chaikinMoneyFlow(candles, 20) }] });

    return panels;
  }, [oscillatorKeys, candles]);

  const comparePanel: OscillatorSeries[] | null = useMemo(() => {
    if (!compareSymbol || !compareCandles) return null;
    return [
      { label: symbol, color: "#471898", points: pctChangeSeries(candles) },
      { label: compareSymbol, color: "#bda360", points: pctChangeSeries(compareCandles) },
    ];
  }, [compareSymbol, compareCandles, candles, symbol]);

  function toggleOverlay(key: string) {
    setOverlayKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleOscillator(key: string) {
    setOscillatorKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
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
        overlays: Array.from(overlayKeys),
        oscillators: Array.from(oscillatorKeys),
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
      {/* Interval — candle size, TradingView's top toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-brand-navy/40">Interval</span>
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

      {/* Range — visible time window, TradingView's bottom toolbar */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-brand-navy/40">Range</span>
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
        <span className="mx-1 h-4 w-px bg-brand-navy/10" />
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
      </div>

      {error && (
        <p className="mt-2 rounded-lg border border-brand-sell/30 bg-brand-sell/5 px-3 py-2 text-xs text-brand-sell">{error}</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <MultiSelectDropdown label="Overlays" options={OVERLAY_OPTIONS} selected={overlayKeys} onToggle={toggleOverlay} />
        <MultiSelectDropdown label="Oscillators" options={OSCILLATOR_OPTIONS} selected={oscillatorKeys} onToggle={toggleOscillator} />
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <DrawingToolbar activeTool={activeTool} onSelectTool={setActiveTool} drawingsCount={drawings.length} onClear={() => setDrawings([])} />
        <div className="flex items-center gap-2">
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

      <div className="mt-4 rounded-2xl border border-black/5 bg-white p-4">
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
