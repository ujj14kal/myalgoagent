import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { marketDataFor } from "@/lib/market-data";
import CustomIndicatorList from "@/components/custom-indicators/list";
import CustomIndicatorsRoot from "@/components/custom-indicators/root";
import { describeCustom, type CustomIndicatorDef } from "@/lib/custom-indicator";
import DevIndicatorCharts from "./charts";

// Development only: the custom-indicator screens and every class drawn on a real chart, without signing in.
// Saving and previewing do nothing here (they need a signed-in user). Not served in production.

export const dynamic = "force-dynamic";

export default async function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  const instruments = await prisma.instrument.findMany({ where: { symbol: { in: ["RELIANCE.NS", "TCS.NS", "INFY.NS"] } }, select: { id: true, symbol: true, name: true }, orderBy: { symbol: "asc" } });
  const candles = await marketDataFor(null, "view").getHistoricalCandles("RELIANCE.NS", "6mo", "1d");
  const t = (i: number) => candles[candles.length - i]?.time ?? 0;
  const last = candles.at(-1)?.close ?? 1000;
  const r = (x: number) => Math.round(x);
  const samples: { name: string; def: CustomIndicatorDef }[] = [
    { name: "Trend strength", def: { type: "formula", formula: "(close - sma(close, 50)) / atr(14)", pane: "separate" } },
    { name: "Midline", def: { type: "formula", formula: "(highest(high, 20) + lowest(low, 20)) / 2", pane: "price", color: "#0891b2" } },
    { name: "EMA cross up", def: { type: "signal", formula: "crossover(ema(close, 10), ema(close, 30))", color: "#ea580c" } },
    { name: "Rising line", def: { type: "line", points: [{ time: t(100), price: r(last * 0.9) }, { time: t(60), price: r(last * 0.95) }] } },
    { name: "Drawn channel", def: { type: "line", points: [{ time: t(100), price: r(last * 0.9) }, { time: t(60), price: r(last * 0.95) }], offset: r(last * 0.06), color: "#be185d" } },
    { name: "Round number", def: { type: "level", price: r(last) } },
    { name: "Demand zone", def: { type: "zone", upper: r(last * 0.97), lower: r(last * 0.94), color: "#16a34a" } },
    { name: "September box", def: { type: "zone", upper: r(last * 1.03), lower: r(last * 1.0), from: t(40), to: t(20), color: "#9333ea" } },
    { name: "20-bar channel", def: { type: "channel", upper: "highest(high, 20)", lower: "lowest(low, 20)", color: "#0f766e" } },
    { name: "2σ band", def: { type: "band", middle: "sma(close, 20)", width: "2 * stdev(close, 20)", color: "#2563eb" } },
  ];
  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4">
      <CustomIndicatorsRoot items={samples}>
        <DevIndicatorCharts candles={candles} samples={samples} />
        <CustomIndicatorList instruments={instruments} items={samples.map((s, i) => ({ id: String(i), name: s.name, description: null, def: s.def, summary: describeCustom(s.def) }))} />
      </CustomIndicatorsRoot>
    </main>
  );
}
