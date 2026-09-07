"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  createSeriesMarkers,
  CandlestickSeries,
  LineSeries,
  AreaSeries,
  BarSeries,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Candle } from "@/lib/market-data";
import type { IndicatorPoint } from "@/lib/indicators";
import type { Signal } from "@/lib/strategy";
import { DrawingsPrimitive, type Drawing } from "@/lib/chart-drawing-primitive";

export interface Overlay {
  label: string;
  color: string;
  points: IndicatorPoint[];
}

export type ChartType = "candlestick" | "line" | "area" | "bar";

// Stable empty defaults — a `= []` default parameter creates a NEW array
// every call, so a caller that never passes overlays/markers/drawings (the
// instrument chart page never passes markers, for instance) was giving each
// of those effects a referentially-new empty array on every re-render,
// re-firing them on every unrelated candles update. Reusing one constant
// keeps those effects from firing until there's an actual change, which
// also ties into a bug this uncovered: lightweight-charts' markers plugin
// re-syncing at the same moment the price series receives a large jump in
// candle count reliably crashed at its internal `ensureNotNull`/`findBar`
// bar-lookup (reproduced switching straight from a 6-month to a 5-year
// range with the markers effect re-firing on that same commit).
const EMPTY_OVERLAYS: Overlay[] = [];
const EMPTY_MARKERS: Signal[] = [];
const EMPTY_DRAWINGS: Drawing[] = [];

type PriceSeries = ISeriesApi<"Candlestick"> | ISeriesApi<"Line"> | ISeriesApi<"Area"> | ISeriesApi<"Bar">;

interface HoverInfo {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export default function CandlestickChart({
  candles,
  overlays = EMPTY_OVERLAYS,
  markers = EMPTY_MARKERS,
  chartType = "candlestick",
  showVolume = false,
  drawings = EMPTY_DRAWINGS,
  activeTool = null,
  onDrawingComplete,
}: {
  candles: Candle[];
  overlays?: Overlay[];
  markers?: Signal[];
  chartType?: ChartType;
  showVolume?: boolean;
  drawings?: Drawing[];
  activeTool?: Drawing["kind"] | null;
  onDrawingComplete?: (drawing: Drawing) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<PriceSeries | null>(null);
  const overlaySeriesRef = useRef<Map<string, ISeriesApi<"Line">>>(new Map());
  const markersPluginRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const drawingsPrimitiveRef = useRef<DrawingsPrimitive | null>(null);
  const candlesRef = useRef<Candle[]>(candles);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const activeToolRef = useRef(activeTool);
  const onDrawingCompleteRef = useRef(onDrawingComplete);
  const pendingPointRef = useRef<{ time: number; price: number } | null>(null);

  useEffect(() => {
    candlesRef.current = candles;
    activeToolRef.current = activeTool;
    onDrawingCompleteRef.current = onDrawingComplete;
  });

  // Chart instance — created once.
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: { background: { color: "#ffffff" }, textColor: "#0e1b2d" },
      grid: { vertLines: { color: "#f0f1f5" }, horzLines: { color: "#f0f1f5" } },
      width: containerRef.current.clientWidth,
      height: 420,
      timeScale: { timeVisible: false, borderColor: "#e2e5ee" },
      rightPriceScale: { borderColor: "#e2e5ee" },
    });

    chartRef.current = chart;

    chart.subscribeCrosshairMove((param) => {
      if (!param.time) {
        setHover(null);
        return;
      }
      const c = candlesRef.current.find((x) => x.time === param.time);
      if (c) setHover({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume });
    });

    chart.subscribeClick((param) => {
      const tool = activeToolRef.current;
      if (!tool || !param.time || param.point === undefined || !seriesRef.current) return;
      const price = seriesRef.current.coordinateToPrice(param.point.y);
      if (price === null) return;
      const point = { time: param.time as number, price };

      if (tool === "horizontal") {
        onDrawingCompleteRef.current?.({ kind: "horizontal", price });
        return;
      }

      if (!pendingPointRef.current) {
        pendingPointRef.current = point;
        return;
      }

      const from = pendingPointRef.current;
      pendingPointRef.current = null;
      if (tool === "trendline") onDrawingCompleteRef.current?.({ kind: "trendline", from, to: point });
      else if (tool === "rectangle") onDrawingCompleteRef.current?.({ kind: "rectangle", from, to: point });
      else if (tool === "fibonacci") onDrawingCompleteRef.current?.({ kind: "fibonacci", from, to: point });
    });

    const handleResize = () => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      // eslint-disable-next-line react-hooks/exhaustive-deps -- ref holds a plain Map, not a DOM node; clearing it here (not a captured stale value) is intentional
      overlaySeriesRef.current.clear();
      markersPluginRef.current = null;
      volumeSeriesRef.current = null;
      drawingsPrimitiveRef.current = null;
    };
  }, []);

  // Price series — recreated whenever chartType changes.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    if (seriesRef.current) {
      chart.removeSeries(seriesRef.current);
      seriesRef.current = null;
    }

    let series: PriceSeries;
    if (chartType === "line") {
      series = chart.addSeries(LineSeries, { color: "#471898", lineWidth: 2 });
    } else if (chartType === "area") {
      series = chart.addSeries(AreaSeries, { lineColor: "#471898", topColor: "rgba(71,24,152,0.3)", bottomColor: "rgba(71,24,152,0)" });
    } else if (chartType === "bar") {
      series = chart.addSeries(BarSeries, { upColor: "#00a83e", downColor: "#d60000" });
    } else {
      series = chart.addSeries(CandlestickSeries, {
        upColor: "#00a83e",
        downColor: "#d60000",
        borderVisible: false,
        wickUpColor: "#00a83e",
        wickDownColor: "#d60000",
      });
    }
    seriesRef.current = series;

    const drawingPrimitive = new DrawingsPrimitive();
    drawingPrimitive.setDrawings(drawings);
    series.attachPrimitive(drawingPrimitive);
    drawingsPrimitiveRef.current = drawingPrimitive;

    markersPluginRef.current = createSeriesMarkers(series as ISeriesApi<"Candlestick">, []);

    const data =
      chartType === "line" || chartType === "area"
        ? candles.map((c) => ({ time: c.time as UTCTimestamp, value: c.close }))
        : candles.map((c) => ({ time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (series as any).setData(data);
    chart.timeScale().fitContent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartType]);

  // Every series' data is synced in ONE effect, in a fixed order, all
  // synchronously before a single fitContent() call at the end. This used
  // to be four separate effects (candles, overlays, markers, volume) that
  // each independently called setData — harmless individually, but when a
  // large candle-count jump (e.g. switching from a 6-month to a 5-year
  // range) landed in the same React commit as an overlay/volume update
  // (which it does whenever either is turned on), the browser could paint
  // a frame where the main series already reflected the new range while a
  // secondary series still held the old, differently-sized dataset. That
  // one mismatched frame reliably corrupted lightweight-charts' internal
  // bar-lookup cache ("ensureNotNull" deep in its candlestick color-style
  // code) permanently — every subsequent repaint kept throwing the same
  // error, forever, even after the secondary series caught up. Updating
  // every series here before yielding back to the browser means no paint
  // can ever observe a mismatched intermediate state. Reproduced and fixed
  // live while building the timeframe picker.
  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return;

    const priceData =
      chartType === "line" || chartType === "area"
        ? candles.map((c) => ({ time: c.time as UTCTimestamp, value: c.close }))
        : candles.map((c) => ({ time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (series as any).setData(priceData);

    const map = overlaySeriesRef.current;
    const nextLabels = new Set(overlays.map((o) => o.label));
    for (const [label, s] of map) {
      if (!nextLabels.has(label)) {
        chart.removeSeries(s);
        map.delete(label);
      }
    }
    for (const overlay of overlays) {
      let s = map.get(overlay.label);
      if (!s) {
        s = chart.addSeries(LineSeries, { color: overlay.color, lineWidth: 2, title: overlay.label });
        map.set(overlay.label, s);
      } else {
        s.applyOptions({ color: overlay.color });
      }
      s.setData(overlay.points.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })));
    }

    if (showVolume) {
      if (!volumeSeriesRef.current) {
        volumeSeriesRef.current = chart.addSeries(HistogramSeries, {
          color: "#bda360",
          priceFormat: { type: "volume" },
          priceScaleId: "volume",
        });
        chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
      }
      volumeSeriesRef.current.setData(
        candles.map((c) => ({
          time: c.time as UTCTimestamp,
          value: c.volume,
          color: c.close >= c.open ? "rgba(0,168,62,0.5)" : "rgba(214,0,0,0.5)",
        })),
      );
    } else if (volumeSeriesRef.current) {
      chart.removeSeries(volumeSeriesRef.current);
      volumeSeriesRef.current = null;
    }

    chart.timeScale().fitContent();
  }, [candles, overlays, showVolume, chartType]);

  // Markers.
  useEffect(() => {
    if (!markersPluginRef.current) return;
    const seriesMarkers: SeriesMarker<Time>[] = markers.map((m) => ({
      time: m.time as UTCTimestamp,
      position: m.type === "entry" ? "belowBar" : "aboveBar",
      color: m.type === "entry" ? "#00a83e" : "#d60000",
      shape: m.type === "entry" ? "arrowUp" : "arrowDown",
      text: m.type === "entry" ? "Entry" : "Exit",
    }));
    markersPluginRef.current.setMarkers(seriesMarkers);
  }, [markers, chartType]);

  // Drawings.
  useEffect(() => {
    drawingsPrimitiveRef.current?.setDrawings(drawings);
  }, [drawings, chartType]);

  // Reset any in-progress two-click drawing when the active tool changes.
  useEffect(() => {
    pendingPointRef.current = null;
  }, [activeTool]);

  return (
    <div className="relative">
      <div ref={containerRef} className="w-full" />
      {hover && (
        <div className="pointer-events-none absolute left-2 top-2 rounded-md bg-white/90 px-2 py-1 text-xs text-brand-navy shadow-sm">
          O <span className="font-medium">{hover.open.toFixed(2)}</span> H{" "}
          <span className="font-medium">{hover.high.toFixed(2)}</span> L{" "}
          <span className="font-medium">{hover.low.toFixed(2)}</span> C{" "}
          <span className="font-medium">{hover.close.toFixed(2)}</span> Vol{" "}
          <span className="font-medium">{hover.volume.toLocaleString("en-IN")}</span>
        </div>
      )}
    </div>
  );
}
