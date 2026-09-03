"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  createSeriesMarkers,
  CandlestickSeries,
  LineSeries,
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

export interface Overlay {
  label: string;
  color: string;
  points: IndicatorPoint[];
}

export default function CandlestickChart({
  candles,
  overlays = [],
  markers = [],
}: {
  candles: Candle[];
  overlays?: Overlay[];
  markers?: Signal[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const overlaySeriesRef = useRef<ISeriesApi<"Line">[]>([]);
  const markersPluginRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: { background: { color: "#ffffff" }, textColor: "#0e1b2d" },
      grid: {
        vertLines: { color: "#f0f1f5" },
        horzLines: { color: "#f0f1f5" },
      },
      width: containerRef.current.clientWidth,
      height: 420,
      timeScale: { timeVisible: false, borderColor: "#e2e5ee" },
      rightPriceScale: { borderColor: "#e2e5ee" },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#00a83e",
      downColor: "#d60000",
      borderVisible: false,
      wickUpColor: "#00a83e",
      wickDownColor: "#d60000",
    });

    chartRef.current = chart;
    seriesRef.current = series;
    markersPluginRef.current = createSeriesMarkers(series, []);

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      overlaySeriesRef.current = [];
      markersPluginRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!seriesRef.current) return;
    seriesRef.current.setData(
      candles.map((c) => ({
        time: c.time as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    );
    chartRef.current?.timeScale().fitContent();
  }, [candles]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    // Clear previous overlay series before drawing the current set.
    for (const s of overlaySeriesRef.current) {
      chart.removeSeries(s);
    }
    overlaySeriesRef.current = [];

    for (const overlay of overlays) {
      const line = chart.addSeries(LineSeries, {
        color: overlay.color,
        lineWidth: 2,
        title: overlay.label,
      });
      line.setData(
        overlay.points.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })),
      );
      overlaySeriesRef.current.push(line);
    }
  }, [overlays]);

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
  }, [markers]);

  return <div ref={containerRef} className="w-full" />;
}
