"use client";

import { useEffect, useRef } from "react";
import { createChart, LineSeries, type IChartApi, type UTCTimestamp } from "lightweight-charts";
import type { IndicatorPoint } from "@/lib/indicators";

export default function RsiChart({ points }: { points: IndicatorPoint[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: { background: { color: "#ffffff" }, textColor: "#0e1b2d" },
      grid: { vertLines: { color: "#f0f1f5" }, horzLines: { color: "#f0f1f5" } },
      width: containerRef.current.clientWidth,
      height: 140,
      timeScale: { visible: false },
      rightPriceScale: { borderColor: "#e2e5ee" },
    });

    const series = chart.addSeries(LineSeries, { color: "#466fff", lineWidth: 2 });
    series.setData(points.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })));

    const upper = chart.addSeries(LineSeries, { color: "#d60000", lineWidth: 1 });
    const lower = chart.addSeries(LineSeries, { color: "#00a83e", lineWidth: 1 });
    if (points.length > 0) {
      upper.setData(points.map((p) => ({ time: p.time as UTCTimestamp, value: 70 })));
      lower.setData(points.map((p) => ({ time: p.time as UTCTimestamp, value: 30 })));
    }

    chart.timeScale().fitContent();
    chartRef.current = chart;

    const handleResize = () => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
      chartRef.current = null;
    };
  }, [points]);

  return <div ref={containerRef} className="w-full" />;
}
