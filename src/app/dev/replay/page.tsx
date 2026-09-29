import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { computeStrategyPreview } from "@/lib/strategy-preview";
import StrategyReplay from "@/components/strategy-replay";
import type { ConditionNode } from "@/lib/strategy";

// Development only: plays the strategy replay for each kind of rule on real
// prices, so the animations can be checked without signing in. Not served in production.

export const dynamic = "force-dynamic";

const off = { enabled: false, unit: "PERCENT" as const, value: 0 };
const SCENARIOS: Record<string, { symbol: string; timeframe: string; entry: ConditionNode; label: string }> = {
  chart: { label: "Chart pattern (double bottom, any)", symbol: "RELIANCE.NS", timeframe: "1d", entry: { kind: "group", op: "OR", children: ["DOUBLE_BOTTOM", "ASCENDING_TRIANGLE", "BULL_FLAG", "FALLING_WEDGE", "INVERSE_HEAD_AND_SHOULDERS"].map((p) => ({ kind: "signal", signal: { family: "CHART_PATTERN", pattern: p } }) as ConditionNode) } },
  volume: { label: "Volume pattern (spike / breakout)", symbol: "TCS.NS", timeframe: "1d", entry: { kind: "group", op: "OR", children: [{ kind: "signal", signal: { family: "VOLUME_PATTERN", pattern: "VOLUME_SPIKE" } }, { kind: "signal", signal: { family: "VOLUME_PATTERN", pattern: "BULLISH_VOLUME_BREAKOUT" } }] } },
  candle: { label: "Candle pattern (bullish engulfing / hammer)", symbol: "INFY.NS", timeframe: "1d", entry: { kind: "group", op: "OR", children: [{ kind: "signal", signal: { family: "CANDLE_PATTERN", pattern: "BULLISH_ENGULFING" } }, { kind: "signal", signal: { family: "CANDLE_PATTERN", pattern: "HAMMER" } }] } },
  custom: {
    label: "Custom indicator (trend strength crosses above 1)",
    symbol: "HDFCBANK.NS",
    timeframe: "1d",
    entry: { kind: "comparison", left: { kind: "custom", name: "Trend strength", def: { type: "formula", formula: "(close - sma(close, 50)) / atr(14)", pane: "separate" } }, operator: "CROSSES_ABOVE", right: { kind: "constant", value: 1 } },
  },
  customprice: {
    label: "Custom indicator on price (close crosses above 20-bar midline)",
    symbol: "SBIN.NS",
    timeframe: "1d",
    entry: { kind: "comparison", left: { kind: "price", field: "CLOSE" }, operator: "CROSSES_ABOVE", right: { kind: "custom", name: "Midline", def: { type: "formula", formula: "(highest(high, 20) + lowest(low, 20)) / 2", pane: "price" } } },
  },
};

export default async function Page({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { s = "chart" } = await searchParams;
  const sc = SCENARIOS[s] ?? SCENARIOS.chart;
  const inst = await prisma.instrument.findUnique({ where: { symbol: sc.symbol }, select: { id: true } });
  if (!inst) return <p>No instrument {sc.symbol}</p>;
  const res = await computeStrategyPreview(null, {
    name: "dev",
    instrumentId: inst.id,
    mode: "NO_CODE",
    direction: "LONG",
    entryCondition: sc.entry,
    exitCondition: { kind: "comparison", left: { kind: "constant", value: 0 }, operator: "GT", right: { kind: "constant", value: 1 } },
    positionSizingMode: "FULL_CAPITAL",
    positionSizingValue: null,
    stopLoss: { enabled: true, unit: "PERCENT", value: 3 },
    target: { enabled: true, unit: "PERCENT", value: 6 },
    trailingSl: off,
    maxPyramidEntries: 1,
    timeframe: sc.timeframe,
  });
  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <nav className="flex flex-wrap gap-2 text-sm">
        {Object.entries(SCENARIOS).map(([k, v]) => (
          <a key={k} href={`/dev/replay?s=${k}`} className={`rounded-full px-3 py-1 ring-1 ${k === s ? "bg-brand-navy text-white" : "ring-black/10"}`}>
            {v.label}
          </a>
        ))}
      </nav>
      {res.ok ? <StrategyReplay preview={res.preview} /> : <p className="text-brand-sell">{res.error}</p>}
    </div>
  );
}
