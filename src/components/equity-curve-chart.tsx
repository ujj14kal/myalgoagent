"use client";

import { useEffect, useRef } from "react";
import { AreaSeries, createChart, type IChartApi, type UTCTimestamp } from "lightweight-charts";
import type { EquityPoint } from "@/lib/backtest/run";

/** One finite point per time, ascending — anything else makes the chart library fail while painting. */
function cleanPoints(points: EquityPoint[]): EquityPoint[] {
  const byTime = new Map<number, number>();
  for (const p of points) if (Number.isFinite(p.time) && Number.isFinite(p.equity)) byTime.set(p.time, p.equity);
  return [...byTime.entries()].sort((a, b) => a[0] - b[0]).map(([time, equity]) => ({ time, equity }));
}

export default function EquityCurveChart({ points, height = 240 }: { points: EquityPoint[]; height?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  const values = cleanPoints(points).map((p) => p.equity);
  const isFlat = values.length > 0 && Math.max(...values) - Math.min(...values) < 1;

  useEffect(() => {
    if (!containerRef.current) return;
    const data = cleanPoints(points);
    if (data.length === 0) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: "transparent" },
        textColor: "rgba(14, 27, 45, 0.55)",
        fontFamily: "var(--font-inter), system-ui, sans-serif",
        fontSize: 11,
        attributionLogo: false,
      },
      grid: { vertLines: { visible: false }, horzLines: { color: "rgba(14, 27, 45, 0.05)" } },
      width: Math.max(containerRef.current.clientWidth, 1),
      height,
      timeScale: { borderVisible: false },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.15, bottom: 0.08 } },
      crosshair: { horzLine: { labelBackgroundColor: "#471898" }, vertLine: { labelBackgroundColor: "#471898" } },
      handleScroll: false,
      handleScale: false,
    });

    const series = chart.addSeries(AreaSeries, {
      lineColor: "#471898",
      lineWidth: 2,
      topColor: "rgba(106, 53, 194, 0.28)",
      bottomColor: "rgba(106, 53, 194, 0.01)",
      priceLineVisible: false,
      priceFormat: { type: "price", precision: 0, minMove: 1 },
      // A flat curve (no closed trades yet) otherwise autoscales to a
      // meaningless ±0.05 range and prints labels like 400000.05.
      autoscaleInfoProvider: (original: () => { priceRange: { minValue: number; maxValue: number } } | null) => {
        const res = original();
        if (!res || !Number.isFinite(res.priceRange.minValue) || !Number.isFinite(res.priceRange.maxValue)) return res;
        const { minValue, maxValue } = res.priceRange;
        const pad = Math.max((maxValue - minValue) * 0.1, Math.abs(maxValue) * 0.005, 1);
        return { ...res, priceRange: { minValue: minValue - pad, maxValue: maxValue + pad } };
      },
    });
    series.setData(data.map((p) => ({ time: p.time as UTCTimestamp, value: p.equity })));
    chart.timeScale().fitContent();
    chartRef.current = chart;

    let removed = false;
    const observer = new ResizeObserver(() => {
      // A hidden or collapsed container reports 0 width; resizing a chart to 0 (or after removal) breaks its next paint.
      const width = containerRef.current?.clientWidth ?? 0;
      if (!removed && width > 0) chart.applyOptions({ width });
    });
    observer.observe(containerRef.current);

    return () => {
      removed = true;
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [points, height]);

  return (
    <div className="relative">
      <div ref={containerRef} className="w-full" />
      {isFlat && (
        <p className="pointer-events-none absolute inset-x-0 top-3 text-center text-xs text-brand-navy/45">
          Flat so far — the curve moves once a forward test closes.
        </p>
      )}
    </div>
  );
}
