"use client";

import { istChartOptions } from "@/lib/chart-time";
import { useEffect, useRef } from "react";
import { createChart, LineSeries, HistogramSeries, type IChartApi, type UTCTimestamp } from "lightweight-charts";
import type { IndicatorPoint } from "@/lib/indicators";

export interface OscillatorSeries {
  label: string;
  color: string;
  points: IndicatorPoint[];
  type?: "line" | "histogram" | "heat";
}

// A `= []` default parameter (or an inline `[...]` literal at a call site)
// creates a NEW array on every render. Since this component's effect
// depends on `referenceLines` by reference, that meant the chart was torn
// down and recreated on every single re-render of the parent — including
// every render during React's initial mount settling — which is what made
// a chart with multiple oscillator panels appear blank for several seconds
// after a page load restored from a saved layout: not actually broken,
// just endlessly destroying and rebuilding itself before ever holding
// still long enough to paint. CandlestickChart already documents and
// avoids this exact pattern; this is the same fix applied here.
const EMPTY_REFERENCE_LINES: number[] = [];

export default function OscillatorPanel({
  series,
  referenceLines = EMPTY_REFERENCE_LINES,
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
      localization: istChartOptions.localization,
      timeScale: { visible: false, ...istChartOptions.timeScale },
      rightPriceScale: { borderColor: "#e2e5ee" },
    });

    for (const s of series) {
      if (s.type === "heat") {
        // Bars from zero whose colour deepens with the size of the value: green above zero, red below.
        const peak = Math.max(1e-9, ...s.points.map((p) => Math.abs(p.value)));
        const heat = chart.addSeries(HistogramSeries, { color: s.color });
        heat.setData(
          s.points.map((p) => {
            const a = 0.2 + 0.8 * (Math.abs(p.value) / peak);
            return { time: p.time as UTCTimestamp, value: p.value, color: p.value >= 0 ? `rgba(0,168,62,${a.toFixed(2)})` : `rgba(214,0,0,${a.toFixed(2)})` };
          }),
        );
      } else if (s.type === "histogram") {
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
