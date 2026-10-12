import { notFound } from "next/navigation";
import { DemoView } from "@/components/agent-chat/proposal-demo";
import BacktestAnalytics from "@/components/backtest/analytics-panel";
import { blockDemo, conceptDemo, indicatorDemo } from "@/lib/demo/proposal-demo";
import { sampleCandles } from "@/lib/demo/sample-chart";
import { runBacktest } from "@/lib/backtest/run";
import type { ConditionNode } from "@/lib/strategy/types";

// Development only: the "how it would look" demos and the backtest results panel on made-up data, so they can be checked without signing in.

export default function DemosPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const cross: ConditionNode = { kind: "comparison", left: { kind: "price", field: "CLOSE" }, operator: "CROSSES_ABOVE", right: { kind: "indicator", type: "SMA", params: [20] } };
  const volume: ConditionNode = { kind: "signal", signal: { family: "VOLUME_PATTERN", pattern: "VOLUME_SPIKE" } };
  const seq: ConditionNode = { kind: "group", op: "AND", children: [volume, cross] };
  const candles = sampleCandles(9, 520);
  const result = runBacktest(
    candles,
    { kind: "comparison", left: { kind: "indicator", type: "RSI", params: [14] }, operator: "CROSSES_ABOVE", right: { kind: "constant", value: 45 } },
    { kind: "comparison", left: { kind: "indicator", type: "RSI", params: [14] }, operator: "CROSSES_BELOW", right: { kind: "constant", value: 55 } },
    { startingCapital: 100000, brokeragePercent: 0.03, slippagePercent: 0.05, positionSizing: { mode: "FULL_CAPITAL", value: null }, riskManagement: { stopLoss: { enabled: true, unit: "PERCENT", value: 3 }, target: null, trailingSl: null }, maxPyramidEntries: 1, direction: "LONG" },
    new Map(),
  );
  const demos = [
    blockDemo("Close crosses above the 20 SMA", cross),
    indicatorDemo("Trend strength", { type: "formula", formula: "(close - sma(close, 50)) / atr(14)", pane: "separate" }),
    indicatorDemo("20-day channel", { type: "channel", upper: "highest(high, 20)", lower: "lowest(low, 20)", pane: "price" }),
    conceptDemo("Volume then breakout", seq, [{ name: "Volume spike", condition: volume }, { name: "Cross above 20 SMA", condition: cross }]),
  ];
  return (
    <div className="mx-auto max-w-4xl space-y-8 p-6">
      {demos.map((d) => (
        <section key={d.title} className="rounded-2xl p-3 ring-1 ring-black/10">
          <h2 className="px-1 pb-2 text-sm font-bold text-brand-navy">
            {d.kind}: {d.title}
          </h2>
          <DemoView demo={d} />
        </section>
      ))}
      <BacktestAnalytics trades={result.trades} equity={result.equityCurve} />
    </div>
  );
}
