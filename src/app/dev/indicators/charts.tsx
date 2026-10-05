"use client";

import { useMemo, useState } from "react";
import CandlestickChart from "@/components/candlestick-chart";
import OscillatorPanel from "@/components/oscillator-panel";
import { classifyCustom, customVisual, type CustomIndicatorDef } from "@/lib/custom-indicator";
import type { Candle } from "@/lib/market-data";

/** Each sample class drawn with the same code the instrument chart uses. */
export default function DevIndicatorCharts({ candles, samples }: { candles: Candle[]; samples: { name: string; def: CustomIndicatorDef }[] }) {
  const [on, setOn] = useState(samples[0].name);
  const s = samples.find((x) => x.name === on)!;
  const v = useMemo(() => customVisual(candles, s.def, s.name), [candles, s]);
  const color = s.def.color ?? "#7c3aed";
  return (
    <section className="surface space-y-3 p-4">
      <div className="flex flex-wrap gap-1.5">
        {samples.map((x) => (
          <button key={x.name} type="button" onClick={() => setOn(x.name)} className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${on === x.name ? "bg-brand-navy text-white" : "ring-brand-navy/15"}`}>
            {x.name} · {classifyCustom(x.def)}
          </button>
        ))}
      </div>
      <CandlestickChart candles={candles} overlays={v.pane === "price" ? v.lines.map((l) => ({ label: l.label, color, points: l.points, dashed: l.dashed })) : []} notes={v.markers.map((time) => ({ time, text: s.name, color }))} />
      {v.pane === "separate" && <OscillatorPanel series={v.lines.map((l) => ({ label: l.label, color, points: l.points }))} />}
      <p data-testid="summary" className="text-xs">
        lines={v.lines.length} points={v.lines.map((l) => l.points.length).join(",")} markers={v.markers.length}
      </p>
    </section>
  );
}
