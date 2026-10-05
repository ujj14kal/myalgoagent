import { describe, expect, it } from "vitest";
import type { Candle } from "@/lib/market-data";
import { entryLevelPrice, entrySlice, stepBar, validateEntryPlan, validatePositionSizing, type EngineConfig, type EngineState, type EntryLevel, type EntryPlan, type TargetLevel } from "./step";

const bar = (i: number, open: number, high: number, low: number, close: number): Candle => ({ time: 1_700_000_000 + i * 86_400, open, high, low, close, volume: 1000 });
const pull = (value: number, allocationPercent: number, extra: Partial<EntryLevel> = {}): EntryLevel => ({ trigger: "PULLBACK", unit: "PERCENT", value, allocationPercent, ...extra });
const plan = (levels: EntryLevel[], firstPercent = 25, maxHoldDays?: number): EntryPlan => ({ firstPercent, levels, ...(maxHoldDays ? { maxHoldDays } : {}) });

function config(p: EntryPlan, over: Partial<EngineConfig> = {}): EngineConfig {
  return { brokeragePercent: 0, slippagePercent: 0, positionSizing: { mode: "FIXED_QUANTITY", value: 100 }, entryPlan: p, ...over };
}

/** One entry signal on bar 0 (filled at bar 1's open), then the rest; returns every step. */
function run(candles: Candle[], cfg: EngineConfig, direction: "LONG" | "SHORT" = "LONG") {
  let state: EngineState = { cash: 1_000_000, position: null };
  const steps = [];
  for (let i = 0; i < candles.length - 1; i++) {
    const r = stepBar(candles, i, i === 0, false, state, { ...cfg, direction });
    state = r.state;
    steps.push(r);
  }
  return { steps, state };
}

describe("validateEntryPlan", () => {
  it("accepts a four-entry accumulation", () => expect(validateEntryPlan(plan([pull(3, 25), pull(6, 25), pull(9, 25)]))).toBeNull());
  it("rejects buying more than the planned size", () => expect(validateEntryPlan(plan([pull(3, 50), pull(6, 50)]))).toMatch(/100%/));
  it("rejects levels that do not move further out", () => expect(validateEntryPlan(plan([pull(6, 25), pull(3, 25)]))).toMatch(/further/));
  it("allows a pullback and a breakout at the same distance", () => expect(validateEntryPlan(plan([pull(3, 25), { trigger: "BREAKOUT", unit: "PERCENT", value: 3, allocationPercent: 25 }]))).toBeNull());
  it("rejects pyramiding together with levels", () => expect(validateEntryPlan(plan([pull(3, 25)]), 3)).toMatch(/not both/));
  it("rejects nonsense", () => {
    expect(validateEntryPlan(plan([pull(0, 25)]))).toMatch(/above zero/);
    expect(validateEntryPlan(plan([pull(3, 0)]))).toMatch(/between 1% and 100%/);
    expect(validateEntryPlan(plan([], 0))).toMatch(/first entry/);
    expect(validateEntryPlan({ firstPercent: 25, levels: [], maxHoldDays: 0 })).toMatch(/holding period/);
    expect(validateEntryPlan(plan([pull(3, 5, { maxWaitDays: 0 })]))).toMatch(/waiting period/);
    expect(validateEntryPlan(plan(Array.from({ length: 9 }, (_, i) => pull(i + 1, 5))))).toMatch(/At most 8/);
  });
});

describe("helpers", () => {
  it("entryLevelPrice: pullbacks sit below a long and above a short; breakouts the reverse", () => {
    expect(entryLevelPrice(pull(3, 25), 100, undefined, "LONG")).toBeCloseTo(97, 8);
    expect(entryLevelPrice(pull(3, 25), 100, undefined, "SHORT")).toBeCloseTo(103, 8);
    expect(entryLevelPrice({ trigger: "BREAKOUT", unit: "POINTS", value: 5, allocationPercent: 25 }, 100, undefined, "LONG")).toBe(105);
    expect(entryLevelPrice({ trigger: "BREAKOUT", unit: "POINTS", value: 5, allocationPercent: 25 }, 100, undefined, "SHORT")).toBe(95);
  });
  it("entrySlice is a share of the plan, at least one share, never past the plan", () => {
    expect(entrySlice(25, 100, 0)).toBe(25);
    expect(entrySlice(25, 100, 90)).toBe(10);
    expect(entrySlice(1, 10, 0)).toBe(1);
    expect(entrySlice(25, 100, 100)).toBe(0);
  });
});

describe("multi-level entry (long)", () => {
  const p = plan([pull(3, 25), pull(6, 25), pull(9, 25)]);

  it("buys its first share on the signal, then each share as price falls to its level", () => {
    const candles = [
      bar(0, 100, 100, 100, 100),
      bar(1, 100, 101, 99.5, 100), // entry: 25 @ 100
      bar(2, 99, 99, 96.5, 97), // level 2 (97): 25 @ 97
      bar(3, 97, 97, 93.5, 94), // level 3 (94): 25 @ 94
      bar(4, 94, 94, 90, 91), // level 4 (91): 25 @ 91
      bar(5, 91, 92, 91, 92),
    ];
    const { steps, state } = run(candles, config(p));
    expect(steps.filter((s) => s.entryLevel).map((s) => [s.entryLevel!.level, s.entryLevel!.quantity, s.entryLevel!.price])).toEqual([[2, 25, 97], [3, 25, 94], [4, 25, 91]]);
    expect(state.position?.quantity).toBe(100);
    expect(state.position?.entryPrice).toBeCloseTo(95.5, 8);
    expect(state.position?.pyramidCount).toBe(4);
  });

  it("does not buy a level that price never reached", () => {
    const candles = [bar(0, 100, 100, 100, 100), bar(1, 100, 101, 99.5, 100), bar(2, 100, 101, 97.5, 100), bar(3, 100, 101, 98, 100)];
    expect(run(candles, config(p)).state.position?.quantity).toBe(25);
  });

  it("fills at the open when price gaps through a level", () => {
    const candles = [bar(0, 100, 100, 100, 100), bar(1, 100, 101, 99.5, 100), bar(2, 95, 96, 94.5, 95), bar(3, 95, 95, 95, 95)];
    const { steps } = run(candles, config(p));
    expect(steps.find((s) => s.entryLevel)?.entryLevel).toMatchObject({ level: 2, price: 95 });
  });

  it("takes one level per bar even when price drops through two", () => {
    const candles = [bar(0, 100, 100, 100, 100), bar(1, 100, 101, 99.5, 100), bar(2, 100, 100, 93, 94), bar(3, 94, 94, 93.5, 94), bar(4, 94, 94, 94, 94)];
    const { steps } = run(candles, config(p));
    expect(steps.filter((s) => s.entryLevel).map((s) => s.entryLevel!.level)).toEqual([2, 3]);
  });

  it("measures the stop-loss from the blended average, and a bar that reaches both the level and the stop buys, then stops out", () => {
    const sl = { stopLoss: { enabled: true, unit: "PERCENT" as const, value: 5 }, target: null, trailingSl: null };
    const candles = [bar(0, 100, 100, 100, 100), bar(1, 100, 101, 99.5, 100), bar(2, 99, 99, 92, 93), bar(3, 93, 93, 93, 93)];
    const { steps, state } = run(candles, config(p, { riskManagement: sl }));
    const exit = steps.find((s) => s.trade)!;
    expect(exit.entryLevel).toMatchObject({ level: 2, quantity: 25, price: 97 });
    expect(exit.exitReason).toBe("stop_loss");
    expect(exit.trade!.quantity).toBe(50);
    expect(exit.trade!.exitPrice).toBeCloseTo(98.5 * 0.95, 8);
    expect(state.position).toBeNull();
  });

  it("withdraws a level after its waiting period", () => {
    const waiting = plan([pull(3, 25, { maxWaitDays: 2 })]);
    const late = [bar(0, 100, 100, 100, 100), bar(1, 100, 101, 99.5, 100), bar(2, 100, 101, 99, 100), bar(3, 100, 101, 99, 100), bar(4, 100, 101, 99, 100), bar(5, 99, 99, 96, 97), bar(6, 97, 97, 97, 97)];
    expect(run(late, config(waiting)).state.position?.quantity).toBe(25);
    const soon = [bar(0, 100, 100, 100, 100), bar(1, 100, 101, 99.5, 100), bar(2, 99, 99, 96, 97), bar(3, 97, 97, 97, 97)];
    expect(run(soon, config(waiting)).state.position?.quantity).toBe(50);
  });

  it("closes at the open once the maximum holding period is reached", () => {
    const hold = plan([], 100, 3);
    const candles = [bar(0, 100, 100, 100, 100), bar(1, 100, 101, 99.5, 100), bar(2, 101, 102, 100, 101), bar(3, 102, 103, 101, 102), bar(4, 103, 104, 102, 103), bar(5, 104, 104, 104, 104)];
    const { steps } = run(candles, config(hold));
    const exit = steps.find((s) => s.trade)!;
    expect(exit.exitReason).toBe("time_stop");
    expect(exit.trade!.exitPrice).toBe(103); // bar 4's open: the third day after the entry on bar 1
  });

  it("with staged targets: sells shares of everything bought so far, and stops adding once a target is taken", () => {
    const targets: TargetLevel[] = [{ unit: "PERCENT", value: 5, exitPercent: 50, lock: { mode: "FIXED" } }];
    const rm = { stopLoss: null, target: null, trailingSl: null, targets };
    const candles = [
      bar(0, 100, 100, 100, 100),
      bar(1, 100, 101, 99.5, 100), // 25 @ 100
      bar(2, 99, 99, 96.5, 97), // +25 @ 97 → 50 shares, average 98.5
      bar(3, 97, 104, 97, 103.5), // 98.5 × 1.05 = 103.425 → Target 1 sells 50% of 50 = 25
      bar(4, 103.6, 103.6, 90, 95), // would reach level 3 (94) but a target is already taken, so no more entries; the lock (103.425) stops the rest
      bar(5, 95, 95, 95, 95),
    ];
    const { steps, state } = run(candles, config(p, { riskManagement: rm }));
    expect(steps.filter((s) => s.entryLevel).map((s) => s.entryLevel!.level)).toEqual([2]);
    const sold = steps.filter((s) => s.trade);
    expect(sold[0].targetLevel).toBe(1);
    expect(sold[0].trade!.quantity).toBe(25);
    expect(sold[1].exitReason).toBe("locked_profit");
    expect(sold[1].trade!.quantity).toBe(25);
    expect(state.position).toBeNull();
  });

  it("survives a restart: saving the state mid-way and resuming gives the same result", () => {
    const candles = [bar(0, 100, 100, 100, 100), bar(1, 100, 101, 99.5, 100), bar(2, 99, 99, 96.5, 97), bar(3, 97, 97, 93.5, 94), bar(4, 94, 94, 90, 91), bar(5, 91, 92, 91, 92)];
    const whole = run(candles, config(p));
    const part = run(candles.slice(0, 3), config(p));
    let state: EngineState = JSON.parse(JSON.stringify(part.state));
    for (let i = 2; i < candles.length - 1; i++) state = stepBar(candles, i, false, false, state, config(p)).state;
    expect(state.position?.quantity).toBe(whole.state.position?.quantity);
    expect(state.position?.entryPrice).toBeCloseTo(whole.state.position!.entryPrice, 8);
    expect(state.position?.pyramidCount).toBe(whole.state.position?.pyramidCount);
  });
});

describe("multi-level entry (other shapes)", () => {
  it("a breakout level adds on strength, with slippage", () => {
    const p = plan([{ trigger: "BREAKOUT", unit: "PERCENT", value: 5, allocationPercent: 25 }]);
    const candles = [bar(0, 100, 100, 100, 100), bar(1, 100, 101, 99.5, 100), bar(2, 101, 107, 101, 106), bar(3, 106, 106, 106, 106)];
    const { steps } = run(candles, config(p, { slippagePercent: 1 }));
    expect(steps.find((s) => s.entryLevel)?.entryLevel).toMatchObject({ level: 2, quantity: 25 });
    expect(steps.find((s) => s.entryLevel)!.entryLevel!.price).toBeCloseTo(101 * 1.05 * 1.01, 8); // the first fill (100 + 1% slippage) is the anchor; the level is 5% above it
  });

  it("a short mirrors a long: its pullback is a rise", () => {
    const p = plan([pull(3, 25)]);
    const candles = [bar(0, 100, 100, 100, 100), bar(1, 100, 100.5, 99, 100), bar(2, 101, 103.5, 101, 103), bar(3, 103, 103, 103, 103)];
    const { steps, state } = run(candles, config(p), "SHORT");
    expect(steps.find((s) => s.entryLevel)?.entryLevel).toMatchObject({ level: 2, price: 103 });
    expect(state.position?.quantity).toBe(50);
  });

  it("without a plan nothing changes", () => {
    const candles = [bar(0, 100, 100, 100, 100), bar(1, 100, 101, 99.5, 100), bar(2, 100, 100, 90, 95), bar(3, 95, 95, 95, 95)];
    const { steps, state } = run(candles, { brokeragePercent: 0, slippagePercent: 0, positionSizing: { mode: "FIXED_QUANTITY", value: 100 } });
    expect(steps.some((s) => s.entryLevel)).toBe(false);
    expect(state.position?.quantity).toBe(100);
  });
});

describe("sizing by risk per position", () => {
  const sl = { stopLoss: { enabled: true, unit: "PERCENT" as const, value: 2 }, target: null, trailingSl: null };
  const risk = (value: number) => ({ mode: "RISK_PERCENT" as const, value });
  const cfg = (value: number, over: Partial<EngineConfig> = {}): EngineConfig => ({ brokeragePercent: 0, slippagePercent: 0, positionSizing: risk(value), riskManagement: sl, ...over });
  const candles = [bar(0, 100, 100, 100, 100), bar(1, 100, 101, 99.5, 100), bar(2, 100, 100, 100, 100)];

  it("buys the shares whose stop-loss distance adds up to the risk", () => {
    // ₹1,000,000 × 1% = ₹10,000 at risk; a 2% stop on ₹100 is ₹2 a share → 5,000 shares, which would cost ₹5,00,000 (affordable)
    const { state } = run(candles, cfg(1) as EngineConfig & { entryPlan: EntryPlan });
    expect(state.position?.quantity).toBe(5000);
  });
  it("a wider stop means fewer shares", () => {
    const wide = { ...cfg(1), riskManagement: { ...sl, stopLoss: { enabled: true, unit: "PERCENT" as const, value: 5 } } };
    expect(run(candles, wide as EngineConfig & { entryPlan: EntryPlan }).state.position?.quantity).toBe(2000);
  });
  it("is capped by what the cash can buy", () => {
    const small: EngineConfig = { ...cfg(50), riskManagement: { ...sl, stopLoss: { enabled: true, unit: "PERCENT", value: 0.5 } } };
    const calm = [bar(0, 100, 100, 100, 100), bar(1, 100, 100.2, 99.8, 100), bar(2, 100, 100, 100, 100)];
    let state: EngineState = { cash: 10_000, position: null };
    for (let i = 0; i < calm.length - 1; i++) state = stepBar(calm, i, i === 0, false, state, small).state;
    expect(state.position?.quantity).toBe(100); // 10,000 / 100
  });
  it("takes its percentage of the stated capital, not of the leveraged cash", () => {
    const c: EngineConfig = { ...cfg(1), positionSizing: { mode: "RISK_PERCENT", value: 1, riskCapital: 100_000 } };
    let state: EngineState = { cash: 500_000, position: null };
    for (let i = 0; i < candles.length - 1; i++) state = stepBar(candles, i, i === 0, false, state, c).state;
    expect(state.position?.quantity).toBe(500); // 1% of 100,000 = 1,000 at ₹2 a share
  });
  it("without a stop-loss nothing is bought", () => {
    const c: EngineConfig = { brokeragePercent: 0, slippagePercent: 0, positionSizing: risk(1) };
    let state: EngineState = { cash: 1_000_000, position: null };
    let tooSmall = false;
    for (let i = 0; i < candles.length - 1; i++) {
      const r = stepBar(candles, i, i === 0, false, state, c);
      state = r.state;
      tooSmall ||= !!r.sizeTooSmall;
    }
    expect(state.position).toBeNull();
    expect(tooSmall).toBe(true);
  });
  it("is limited to 100%", () => expect(() => validatePositionSizing({ mode: "RISK_PERCENT", value: 120 })).toThrow(/100%/));
});
