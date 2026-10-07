import { describe, expect, it } from "vitest";
import type { Candle } from "@/lib/market-data";
import { computeQuantity, lockFloor, stepBar, targetPrice, validateTargets, type EngineConfig, type EngineState, type EngineTrade, type ExitReason, type RiskManagementConfig, type TargetLevel } from "./step";
import { engineRisk, parseRiskOptions, riskExample, riskOptionsProblem, DEFAULT_RISK_OPTIONS, type RiskOptions } from "./risk-options";

const bar = (i: number, open: number, high: number, low: number, close: number): Candle => ({ time: 1_700_000_000 + i * 86_400, open, high, low, close, volume: 1000 });
const tgt = (unit: TargetLevel["unit"], value: number, exitPercent: number, lock: TargetLevel["lock"] = { mode: "FIXED" }): TargetLevel => ({ unit, value, exitPercent, lock });
const opts = (o: Partial<RiskOptions>): RiskOptions => ({ ...DEFAULT_RISK_OPTIONS, ...o });

function cfg(rm: Partial<RiskManagementConfig>, extra: Partial<EngineConfig> = {}): EngineConfig {
  return { brokeragePercent: 0, slippagePercent: 0, positionSizing: { mode: "FIXED_QUANTITY", value: 100 }, riskManagement: { stopLoss: null, target: null, trailingSl: null, ...rm }, ...extra };
}

type Step = { trade?: EngineTrade; reason?: ExitReason; level?: number; blockedBy?: string };
function run(candles: Candle[], config: EngineConfig, signals: number[] = [0], start: EngineState = { cash: 1_000_000, position: null }) {
  let state = start;
  const steps: Step[] = [];
  for (let i = 0; i < candles.length - 1; i++) {
    const r = stepBar(candles, i, signals.includes(i), false, state, config);
    state = r.state;
    steps.push({ trade: r.trade, reason: r.exitReason, level: r.targetLevel, blockedBy: r.blockedBy });
  }
  return { steps, state };
}

describe("the brief's examples", () => {
  it("price-based: entry 100, SL 2% → 98, TP 5% → 105", () => {
    const e = riskExample({ entry: 100, capital: 100, stop: { enabled: true, unit: "PERCENT", value: 2 }, target: { enabled: true, unit: "PERCENT", value: 5 }, options: DEFAULT_RISK_OPTIONS });
    expect(e).toMatchObject({ stopPrice: 98, targetPrice: 105, quantity: 1, exposure: 100, margin: 100, stopPnl: -2, targetPnl: 5 });
  });
  it("5× leverage: a ₹100 share needs ₹20 of margin; the stop and target stay at the real prices", () => {
    const e = riskExample({ entry: 100, capital: 20, stop: { enabled: true, unit: "PERCENT", value: 2 }, target: { enabled: true, unit: "PERCENT", value: 5 }, options: opts({ leverage: 5 }) });
    expect(e).toMatchObject({ quantity: 1, exposure: 100, margin: 20, stopPrice: 98, targetPrice: 105, stopPnl: -2, targetPnl: 5 });
    // Measured against the ₹20 actually put up: −10% and +25%.
    expect(e.stopPctOfMargin).toBe(-10);
    expect(e.targetPctOfMargin).toBe(25);
  });
  it("on capital: a 1% stop and 2% target on ₹20,000 are ₹200 lost / ₹400 made, whatever the price", () => {
    // 200 shares at ₹100 (full capital, no leverage): ₹200 over 200 shares = ₹1 a share; ₹400 = ₹2 a share.
    const e = riskExample({ entry: 100, capital: 20_000, stop: { enabled: true, unit: "PERCENT", value: 1 }, target: { enabled: true, unit: "PERCENT", value: 2 }, options: opts({ reference: "CAPITAL" }) });
    expect(e).toMatchObject({ quantity: 200, stopPrice: 99, targetPrice: 102, stopPnl: -200, targetPnl: 400 });
    // A ₹ amount of capital works the same way: ₹500 over 200 shares = ₹2.50 a share.
    const f = riskExample({ entry: 100, capital: 20_000, stop: { enabled: true, unit: "POINTS", value: 500 }, target: null, options: opts({ reference: "CAPITAL" }) });
    expect(f).toMatchObject({ stopPrice: 97.5, stopPnl: -500 });
  });
  it("the engine gets the legs untouched, plus what they are measured on", () => {
    const rm = engineRisk({ stopLoss: { enabled: true, unit: "PERCENT", value: 10 }, target: null, trailingSl: { enabled: true, unit: "POINTS", value: 3 } }, opts({ leverage: 5, reference: "CAPITAL" }));
    expect(rm.riskManagement.stopLoss).toMatchObject({ unit: "PERCENT", value: 10 });
    expect(rm.riskBasis).toBe("CAPITAL");
    expect(rm.leverage).toBe(5);
    expect(engineRisk({ stopLoss: null, target: null, trailingSl: null }, DEFAULT_RISK_OPTIONS).riskBasis).toBe("PRICE");
  });
});

describe("stop-loss and target measured on capital, in the engine", () => {
  // 10 shares bought at ₹100 with ₹10,000 of capital. On the share price a 1% stop is ₹1 a share (₹10); on capital it is
  // 1% of ₹10,000 = ₹100 over 10 shares = ₹10 a share.
  const sizing = { mode: "FIXED_QUANTITY" as const, value: 10 };
  const down = [bar(0, 100, 100, 100, 100), bar(1, 100, 100, 99.5, 100), bar(2, 100, 100, 89, 90), bar(3, 90, 90, 90, 90)];
  it("share price: the stop is 1% below the entry", () => {
    const r = run(down, cfg({ stopLoss: { enabled: true, unit: "PERCENT", value: 1 } }, { positionSizing: sizing }), [0], { cash: 10_000, position: null });
    expect(r.steps.find((s) => s.trade)!.trade!.exitPrice).toBe(99);
  });
  it("capital: the stop is the price move that loses 1% of the capital", () => {
    const r = run(down, cfg({ stopLoss: { enabled: true, unit: "PERCENT", value: 1 } }, { positionSizing: sizing, riskBasis: "CAPITAL" }), [0], { cash: 10_000, position: null });
    const t = r.steps.find((s) => s.trade)!.trade!;
    expect([t.exitPrice, t.netPnl]).toEqual([90, -100]);
  });
  it("capital, in rupees: a ₹50 target on 10 shares is ₹5 a share", () => {
    const up = [bar(0, 100, 100, 100, 100), bar(1, 100, 100, 100, 100), bar(2, 100, 106, 100, 105), bar(3, 105, 105, 105, 105)];
    const r = run(up, cfg({ target: { enabled: true, unit: "POINTS", value: 50 } }, { positionSizing: sizing, riskBasis: "CAPITAL" }), [0], { cash: 10_000, position: null });
    const t = r.steps.find((s) => s.trade)!.trade!;
    expect([t.exitPrice, t.netPnl]).toEqual([105, 50]);
  });
  it("can't be combined with sizing by risk", () => {
    expect(riskOptionsProblem(opts({ reference: "CAPITAL" }), { productType: "DELIVERY", stopLossOn: true, sizingMode: "RISK_PERCENT" })).toMatch(/can't be combined/);
    expect(riskOptionsProblem(opts({ reference: "CAPITAL" }), { productType: "DELIVERY", stopLossOn: true, sizingMode: "FIXED_QUANTITY" })).toBeNull();
    expect(parseRiskOptions({ reference: "MARGIN" }).reference).toBe("CAPITAL"); // the earlier name
  });
});

describe("leverage in sizing", () => {
  it("buys up to capital × leverage, never changing the price", () => {
    expect(computeQuantity(20_000, 100, { mode: "FULL_CAPITAL", value: null }, undefined, 5)).toBe(1000);
    expect(computeQuantity(20_000, 100, { mode: "PERCENT_OF_CAPITAL", value: 50 }, undefined, 5)).toBe(500);
    expect(computeQuantity(20_000, 100, { mode: "FIXED_CAPITAL", value: 10_000 }, undefined, 5)).toBe(500);
  });
  it("risk-based sizing still risks a share of the capital (leverage only lifts the cap)", () => {
    // 1% of 20,000 = ₹200 at ₹2 a share risk → 100 shares, within 1,000 affordable.
    expect(computeQuantity(20_000, 100, { mode: "RISK_PERCENT", value: 1 }, 2, 5)).toBe(100);
  });
  it("is checked: only intraday, at most 20×", () => {
    expect(riskOptionsProblem(opts({ leverage: 5 }), { productType: "DELIVERY", stopLossOn: true })).toMatch(/intraday/);
    expect(riskOptionsProblem(opts({ leverage: 25 }), { productType: "INTRADAY", stopLossOn: true })).toMatch(/between/);
    expect(riskOptionsProblem(opts({ leverage: 5, reference: "CAPITAL" }), { productType: "INTRADAY", stopLossOn: true })).toBeNull();
    expect(parseRiskOptions({ leverage: 99, reference: "x" })).toEqual(DEFAULT_RISK_OPTIONS);
  });
});

describe("multi-target exits with stop rules (entry 100, SL 98, TP 103 / 106 / 110 for 30 / 30 / 40%)", () => {
  const sl = { enabled: true, unit: "POINTS" as const, value: 2 };
  const ladder = (l1: TargetLevel["lock"], l2: TargetLevel["lock"], l3: TargetLevel["lock"] = { mode: "KEEP" }) => [tgt("POINTS", 3, 30, l1), tgt("POINTS", 6, 30, l2), tgt("POINTS", 10, 40, l3)];
  const up = [bar(0, 100, 100, 100, 100), bar(1, 100, 100.5, 99.5, 100), bar(2, 100, 103.5, 100, 103), bar(3, 103, 106.5, 103, 106)];

  it("after TP1 the stop moves to breakeven; after TP2 to TP1", () => {
    const candles = [...up, bar(4, 105, 105, 102.5, 103), bar(5, 103, 103, 102, 102)];
    const { steps } = run(candles, cfg({ stopLoss: sl, targets: ladder({ mode: "BREAKEVEN" }, { mode: "PREVIOUS" }) }));
    const sold = steps.filter((s) => s.trade);
    expect(sold.map((s) => [s.reason, s.trade!.exitPrice, s.trade!.quantity])).toEqual([
      ["target", 103, 30],
      ["target", 106, 30],
      ["locked_profit", 103, 40], // the rest stopped at TP1's price, moved there by TP2's rule
    ]);
  });
  it("KEEP leaves the original stop", () => {
    const candles = [...up.slice(0, 3), bar(3, 101, 101, 97.5, 98), bar(4, 98, 98, 98, 98)];
    const { steps } = run(candles, cfg({ stopLoss: sl, targets: ladder({ mode: "KEEP" }, { mode: "KEEP" }) }));
    expect(steps.filter((s) => s.trade).map((s) => [s.reason, s.trade!.exitPrice])).toEqual([
      ["target", 103],
      ["stop_loss", 98],
    ]);
  });
  it("TRAIL follows the best price by its distance from the next candle", () => {
    // TP1 at 103 switches on a 2-point trail; price runs to 108, then falls back: stopped at 106 (108 − 2).
    const candles = [...up.slice(0, 3), bar(3, 103, 108, 103, 107.5), bar(4, 107, 107, 105.5, 106), bar(5, 106, 106, 106, 106)];
    const { steps } = run(candles, cfg({ stopLoss: sl, targets: [tgt("POINTS", 3, 30, { mode: "TRAIL", unit: "POINTS", value: 2 }), tgt("POINTS", 20, 30)] }));
    const sold = steps.filter((s) => s.trade);
    expect(sold.map((s) => [s.reason, s.trade!.exitPrice])).toEqual([
      ["target", 103],
      ["locked_profit", 106],
    ]);
  });
  it("lockFloor: KEEP and TRAIL don't move the stop at the target; PREVIOUS uses the earlier target", () => {
    expect(lockFloor(tgt("POINTS", 6, 30, { mode: "KEEP" }), 106, 100, undefined, "LONG")).toBeNull();
    expect(lockFloor(tgt("POINTS", 6, 30, { mode: "PREVIOUS" }), 106, 100, undefined, "LONG", 103)).toBe(103);
    expect(lockFloor(tgt("POINTS", 6, 30, { mode: "BREAKEVEN" }), 106, 100, undefined, "SHORT")).toBe(100);
  });
  it("validates trail distances", () => {
    expect(validateTargets([tgt("POINTS", 3, 30, { mode: "TRAIL", unit: "POINTS", value: 0 })])).toMatch(/trailing distance/);
    expect(validateTargets([tgt("POINTS", 3, 30, { mode: "TRAIL", unit: "R_MULTIPLE", value: 1 })])).toMatch(/points, % or ATR/);
  });
});

describe("risk/reward targets (R multiples)", () => {
  it("a 2R target sits twice the stop distance away, for single and staged targets", () => {
    const sl = { enabled: true, unit: "PERCENT" as const, value: 2 };
    const candles = [bar(0, 100, 100, 100, 100), bar(1, 100, 100.5, 99.5, 100), bar(2, 100, 104.5, 100, 104), bar(3, 104, 104, 104, 104)];
    const { steps } = run(candles, cfg({ stopLoss: sl, target: { enabled: true, unit: "R_MULTIPLE", value: 2 } }));
    expect(steps.find((s) => s.trade)!.trade!.exitPrice).toBeCloseTo(104);
    expect(targetPrice(tgt("R_MULTIPLE", 1.5, 50), 100, undefined, "SHORT", 2)).toBe(97);
    expect(targetPrice(tgt("R_MULTIPLE", 1.5, 50), 100, undefined, "LONG", null)).toBeNull();
  });
});

describe("break-even", () => {
  it("moves the stop to the entry once price has moved far enough", () => {
    const candles = [bar(0, 100, 100, 100, 100), bar(1, 100, 100.5, 99.5, 100), bar(2, 100, 101.6, 100, 101.5), bar(3, 101, 101, 99.8, 100), bar(4, 100, 100, 100, 100)];
    const { steps } = run(candles, cfg({ stopLoss: { enabled: true, unit: "PERCENT", value: 2 }, breakEven: { enabled: true, unit: "PERCENT", value: 1.5 } }));
    const t = steps.find((s) => s.trade)!;
    expect([t.reason, t.trade!.exitPrice]).toEqual(["locked_profit", 100]);
  });
});

describe("system limits", () => {
  // Each trade: buy at 100, stopped at 90 → −₹1,000 on 100 shares (10% of ₹10,000).
  const losing = (n: number) => [bar(n, 100, 100, 100, 100), bar(n + 1, 100, 100, 89, 90)];
  it("stop new positions for the day after the daily loss limit", () => {
    const candles = [bar(0, 100, 100, 100, 100), ...[1, 3].flatMap((n) => losing(n)), bar(5, 100, 100, 100, 100), bar(6, 100, 100, 100, 100)].map((c, i) => ({ ...c, time: 1_700_000_000 + i * 600 }));
    const config = cfg({ stopLoss: { enabled: true, unit: "POINTS", value: 10 } }, { limits: { maxDailyLossPercent: 15 } });
    const { steps } = run(candles, config, [0, 3, 5], { cash: 10_000, position: null });
    expect(steps.filter((s) => s.trade).length).toBe(2);
    expect(steps.some((s) => s.blockedBy === "daily_loss")).toBe(true);
  });
  it("halts for good after the drawdown limit", () => {
    const candles = [bar(0, 100, 100, 100, 100), bar(1, 100, 100, 89, 90), bar(2, 100, 100, 100, 100), bar(3, 100, 100, 100, 100)];
    const config = cfg({ stopLoss: { enabled: true, unit: "POINTS", value: 10 } }, { limits: { maxDrawdownPercent: 5 } });
    const { steps, state } = run(candles, config, [0, 2], { cash: 10_000, position: null });
    expect(state.memo?.halted).toBe(true);
    expect(steps[2].blockedBy).toBe("drawdown");
  });
});
