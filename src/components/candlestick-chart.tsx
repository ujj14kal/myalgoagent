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
  overlays = [],
  markers = [],
  chartType = "candlestick",
  showVolume = false,
  drawings = [],
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
  const overlaySeriesRef = useRef<ISeriesApi<"Line">[]>([]);
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
      overlaySeriesRef.current = [];
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

  // Candle data updates (same series, new data).
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    const data =
      chartType === "line" || chartType === "area"
        ? candles.map((c) => ({ time: c.time as UTCTimestamp, value: c.close }))
        : candles.map((c) => ({ time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (series as any).setData(data);
    chartRef.current?.timeScale().fitContent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles]);

  // Overlays.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    for (const s of overlaySeriesRef.current) chart.removeSeries(s);
    overlaySeriesRef.current = [];

    for (const overlay of overlays) {
      const line = chart.addSeries(LineSeries, { color: overlay.color, lineWidth: 2, title: overlay.label });
      line.setData(overlay.points.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })));
      overlaySeriesRef.current.push(line);
    }
  }, [overlays]);

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

  // Volume panel.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    if (volumeSeriesRef.current) {
      chart.removeSeries(volumeSeriesRef.current);
      volumeSeriesRef.current = null;
    }

    if (!showVolume) return;

    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: "#bda360",
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });
    chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    volumeSeries.setData(
      candles.map((c) => ({
        time: c.time as UTCTimestamp,
        value: c.volume,
        color: c.close >= c.open ? "rgba(0,168,62,0.5)" : "rgba(214,0,0,0.5)",
      })),
    );
    volumeSeriesRef.current = volumeSeries;
  }, [showVolume, candles]);

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
