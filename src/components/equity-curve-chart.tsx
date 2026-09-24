"use client";

import { useEffect, useRef } from "react";
import { AreaSeries, createChart, type IChartApi, type UTCTimestamp } from "lightweight-charts";
import type { EquityPoint } from "@/lib/backtest/run";

export default function EquityCurveChart({ points, height = 240 }: { points: EquityPoint[]; height?: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  const values = points.map((p) => p.equity);
  const isFlat = values.length > 0 && Math.max(...values) - Math.min(...values) < 1;

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: "transparent" },
        textColor: "rgba(14, 27, 45, 0.55)",
        fontFamily: "var(--font-inter), system-ui, sans-serif",
        fontSize: 11,
        attributionLogo: false,
      },
      grid: { vertLines: { visible: false }, horzLines: { color: "rgba(14, 27, 45, 0.05)" } },
      width: containerRef.current.clientWidth,
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
        if (!res) return res;
        const { minValue, maxValue } = res.priceRange;
        const pad = Math.max((maxValue - minValue) * 0.1, Math.abs(maxValue) * 0.005, 1);
        return { ...res, priceRange: { minValue: minValue - pad, maxValue: maxValue + pad } };
      },
    });
    series.setData(points.map((p) => ({ time: p.time as UTCTimestamp, value: p.equity })));
    chart.timeScale().fitContent();
    chartRef.current = chart;

    const observer = new ResizeObserver(() => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
    });
    observer.observe(containerRef.current);

    return () => {
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
          Flat so far — the curve moves once a paper trade closes.
        </p>
      )}
    </div>
  );
}
