"use client";

import { useEffect, useRef } from "react";
import { createChart, LineSeries, HistogramSeries, type IChartApi, type UTCTimestamp } from "lightweight-charts";
import type { IndicatorPoint } from "@/lib/indicators";

export interface OscillatorSeries {
  label: string;
  color: string;
  points: IndicatorPoint[];
  type?: "line" | "histogram";
}

export default function OscillatorPanel({
  series,
  referenceLines = [],
}: {
  series: OscillatorSeries[];
  referenceLines?: number[];
}) {
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

    for (const s of series) {
      if (s.type === "histogram") {
        const hist = chart.addSeries(HistogramSeries, { color: s.color });
        hist.setData(
          s.points.map((p) => ({ time: p.time as UTCTimestamp, value: p.value, color: p.value >= 0 ? "#00a83e" : "#d60000" })),
        );
      } else {
        const line = chart.addSeries(LineSeries, { color: s.color, lineWidth: 2, title: s.label });
        line.setData(s.points.map((p) => ({ time: p.time as UTCTimestamp, value: p.value })));
      }
    }

    const referenceTimes = series[0]?.points.map((p) => p.time) ?? [];
    if (referenceTimes.length > 0) {
      for (const level of referenceLines) {
        const line = chart.addSeries(LineSeries, { color: "#9aa3b2", lineWidth: 1, lineStyle: 2 });
        line.setData(referenceTimes.map((time) => ({ time: time as UTCTimestamp, value: level })));
      }
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
  }, [series, referenceLines]);

  return <div ref={containerRef} className="w-full" />;
}
