import { describe, expect, it } from "vitest";
import type { Candle } from "@/lib/market-data";
import { stepBar, type EngineConfig, type EngineState, type TargetLevel } from "./step";

const bar = (i: number, open: number, high: number, low: number, close: number): Candle => ({ time: 1_700_000_000 + i * 86_400, open, high, low, close, volume: 1000 });
const fib = (ratio: number, exitPercent: number): TargetLevel => ({ unit: "POINTS", value: ratio, fibExtension: ratio, exitPercent, lock: { mode: "BREAKEVEN" } });

function run(candles: Candle[], cfg: EngineConfig) {
  let state: EngineState = { cash: 1_000_000, position: null };
  const exits: { price: number; level?: number }[] = [];
  for (let i = 0; i < candles.length - 1; i++) {
    const r = stepBar(candles, i, i === 0, false, state, cfg);
    state = r.state;
    if (r.trade) exits.push({ price: r.trade.exitPrice, level: r.targetLevel });
  }
  return exits;
}

describe("a staged target at a Fibonacci extension", () => {
  const candles = [bar(0, 150, 150, 150, 150), bar(1, 150, 151, 149, 150), bar(2, 150, 160, 149, 158), bar(3, 158, 230, 157, 228), bar(4, 228, 265, 226, 262), bar(5, 262, 263, 261, 262)];
  const base = (swing: { start: number; end: number } | undefined): EngineConfig => ({
    brokeragePercent: 0,
    slippagePercent: 0,
    positionSizing: { mode: "FIXED_QUANTITY", value: 100 },
    riskManagement: { stopLoss: null, target: null, trailingSl: null, targets: [fib(1.272, 50), fib(1.618, 50)] } as EngineConfig["riskManagement"],
    fibSwingAtEntry: swing ? () => swing : undefined,
  });
  it("sells half at 1.272 and the rest at 1.618 of the swing fixed at entry", () => {
    const exits = run(candles, base({ start: 100, end: 200 }));
    expect(exits.map((e) => e.level)).toEqual([1, 2]);
    expect(exits[0].price).toBeCloseTo(227.2, 6);
    expect(exits[1].price).toBeCloseTo(261.8, 6);
  });
  it("never takes the target when there was no valid swing at entry (the position just runs)", () => {
    expect(run(candles, base(undefined))).toEqual([]);
  });
});
