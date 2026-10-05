import { describe, expect, it } from "vitest";
import type { Candle } from "@/lib/market-data";
import { lockFloor, stepBar, targetQuantity, targetsTakenFor, validateTargets, type EngineConfig, type EngineState, type EngineTrade, type ExitReason, type TargetLevel } from "./step";

const bar = (i: number, open: number, high: number, low: number, close: number): Candle => ({ time: 1_700_000_000 + i * 86_400, open, high, low, close, volume: 1000 });
const pct = (value: number, exitPercent: number, lock: TargetLevel["lock"] = { mode: "FIXED" }): TargetLevel => ({ unit: "PERCENT", value, exitPercent, lock });

function config(targets: TargetLevel[], direction: "LONG" | "SHORT" = "LONG"): EngineConfig {
  return {
    brokeragePercent: 0,
    slippagePercent: 0,
    positionSizing: { mode: "FIXED_QUANTITY", value: 100 },
    direction,
    riskManagement: { stopLoss: null, target: null, trailingSl: null, targets },
  };
}

type Step = { trade?: EngineTrade; reason?: ExitReason; level?: number };

/** Runs the candles with one entry signal on bar 0 (filled at bar 1's open) and returns each step's outcome. */
function run(candles: Candle[], cfg: EngineConfig, start?: EngineState): { steps: Step[]; state: EngineState } {
  let state: EngineState = start ?? { cash: 1_000_000, position: null };
  const steps: Step[] = [];
  for (let i = 0; i < candles.length - 1; i++) {
    const r = stepBar(candles, i, !start && i === 0, false, state, cfg);
    state = r.state;
    steps.push({ trade: r.trade, reason: r.exitReason, level: r.targetLevel });
  }
  return { steps, state };
}

describe("validateTargets", () => {
  it("accepts a sensible ladder", () => expect(validateTargets([pct(5, 25), pct(10, 25), pct(15, 25)])).toBeNull());
  it("accepts none", () => expect(validateTargets([])).toBeNull());
  it("rejects more than 100% sold in total", () => expect(validateTargets([pct(5, 60), pct(10, 60)])).toMatch(/100%/));
  it("rejects targets that do not move further out", () => expect(validateTargets([pct(10, 25), pct(5, 25)])).toMatch(/further/));
  it("rejects using both the single take-profit and staged targets", () => expect(validateTargets([pct(5, 25)], true)).toMatch(/not both/));
  it("rejects a margin as big as the target itself", () => expect(validateTargets([pct(5, 25, { mode: "MARGIN", unit: "PERCENT", value: 5 })])).toMatch(/smaller/));
  it("rejects more than three", () => expect(validateTargets([pct(1, 10), pct(2, 10), pct(3, 10), pct(4, 10)])).toMatch(/At most 3/));
  it("rejects zero and absurd sizes", () => {
    expect(validateTargets([pct(0, 25)])).toMatch(/above zero/);
    expect(validateTargets([pct(5, 0)])).toMatch(/between 1% and 100%/);
  });
});

describe("staged targets (long)", () => {
  const levels = [pct(5, 25), pct(10, 25), pct(15, 25)];

  it("sells a share at each target and keeps the rest running", () => {
    const candles = [
      bar(0, 100, 100, 100, 100),
      bar(1, 100, 101, 99, 100), // entry fills at 100 → 100 shares
      bar(2, 100, 105.5, 100, 105), // TP1 105
      bar(3, 106, 110.5, 105.5, 110), // TP2 110 (stays above the 105 lock)
      bar(4, 111, 115.5, 110.5, 115), // TP3 115 (stays above the 110 lock)
      bar(5, 115, 116, 114, 115),
    ];
    const { steps, state } = run(candles, config(levels));
    const sold = steps.filter((s) => s.trade);
    expect(sold.map((s) => s.level)).toEqual([1, 2, 3]);
    expect(sold.map((s) => s.trade!.quantity)).toEqual([25, 25, 25]);
    expect(sold.map((s) => s.trade!.exitPrice)).toEqual([105, 110, 115]);
    expect(state.position?.quantity).toBe(25);
    expect(state.position?.targetsHit).toBe(3);
    // realised: 25×5 + 25×10 + 25×15 = 750
    expect(state.cash).toBeCloseTo(1_000_750, 6);
  });

  it("never takes the same target twice", () => {
    const candles = [bar(0, 100, 100, 100, 100), bar(1, 100, 101, 99, 100), bar(2, 100, 106, 100, 106), bar(3, 106, 107, 106, 107), bar(4, 107, 108, 107, 108), bar(5, 108, 108, 108, 108)];
    const { steps } = run(candles, config(levels));
    expect(steps.filter((s) => s.level === 1)).toHaveLength(1);
    expect(steps.filter((s) => s.trade)).toHaveLength(1);
  });

  it("takes one target per bar even when price gaps through two", () => {
    const candles = [bar(0, 100, 100, 100, 100), bar(1, 100, 101, 99, 100), bar(2, 100, 112, 100, 112), bar(3, 112, 112, 112, 112), bar(4, 112, 112, 112, 112)];
    const { steps } = run(candles, config(levels));
    expect(steps.filter((s) => s.trade).map((s) => s.level)).toEqual([1, 2]);
  });

  it("FIXED lock: price falling back to the taken target sells the rest there", () => {
    const candles = [bar(0, 100, 100, 100, 100), bar(1, 100, 101, 99, 100), bar(2, 100, 105.5, 100, 105), bar(3, 105, 105.2, 104.9, 105), bar(4, 105, 105, 105, 105)];
    const { steps, state } = run(candles, config(levels));
    const last = steps.filter((s) => s.trade).at(-1)!;
    expect(last.reason).toBe("locked_profit");
    expect(last.trade!.exitPrice).toBe(105);
    expect(last.trade!.quantity).toBe(75);
    expect(state.position).toBeNull();
  });

  it("MARGIN lock: price may pull back by the margin before the lock is hit", () => {
    const margin: TargetLevel[] = [pct(5, 25, { mode: "MARGIN", unit: "PERCENT", value: 1 }), pct(10, 25)];
    const holds = [bar(0, 100, 100, 100, 100), bar(1, 100, 101, 99, 100), bar(2, 100, 105.5, 100, 105), bar(3, 105, 105, 104.2, 104.5), bar(4, 104.5, 104.8, 104.5, 104.8)];
    expect(run(holds, config(margin)).state.position?.quantity).toBe(75); // floor is 104; 104.2 did not touch it
    const breaks = [...holds.slice(0, 3), bar(3, 105, 105, 103.9, 104), bar(4, 104, 104, 104, 104)];
    const out = run(breaks, config(margin));
    const last = out.steps.filter((s) => s.trade).at(-1)!;
    expect(last.reason).toBe("locked_profit");
    expect(last.trade!.exitPrice).toBe(104); // entry 100 + 5 − 1% of entry
    expect(out.state.position).toBeNull();
  });

  it("the lock only applies from the bar after the target was taken", () => {
    // TP1 touched and price falls back through it within the same bar: the rest is still held.
    const candles = [bar(0, 100, 100, 100, 100), bar(1, 100, 101, 99, 100), bar(2, 100, 105.5, 100, 100.5), bar(3, 100.5, 101, 100.2, 100.8)];
    const { state } = run(candles, config(levels));
    expect(state.position?.quantity).toBe(75);
    expect(state.position?.lockedStopPrice).toBe(105);
  });

  it("a stop-loss below still works before any target", () => {
    const cfg = config(levels);
    cfg.riskManagement = { ...cfg.riskManagement!, stopLoss: { enabled: true, unit: "PERCENT", value: 2 } };
    const candles = [bar(0, 100, 100, 100, 100), bar(1, 100, 101, 99, 100), bar(2, 100, 100, 97, 98), bar(3, 98, 98, 98, 98)];
    const { steps } = run(candles, cfg);
    const out = steps.filter((s) => s.trade);
    expect(out).toHaveLength(1);
    expect(out[0].reason).toBe("stop_loss");
    expect(out[0].trade!.quantity).toBe(100);
  });

  it("closes the whole position when the targets add up to 100%", () => {
    const full = [pct(5, 50), pct(10, 50)];
    const candles = [bar(0, 100, 100, 100, 100), bar(1, 100, 101, 99, 100), bar(2, 100, 105.5, 100, 105), bar(3, 106, 110.5, 105.5, 110), bar(4, 110, 110, 110, 110)];
    const { steps, state } = run(candles, config(full));
    expect(steps.filter((s) => s.trade).map((s) => s.trade!.quantity)).toEqual([50, 50]);
    expect(state.position).toBeNull();
  });

  it("survives a restart: saving the state mid-way and resuming gives the same result", () => {
    const candles = [bar(0, 100, 100, 100, 100), bar(1, 100, 101, 99, 100), bar(2, 100, 105.5, 100, 105), bar(3, 106, 110.5, 105.5, 110), bar(4, 111, 115.5, 110.5, 115), bar(5, 115, 115, 115, 115)];
    const whole = run(candles, config(levels));
    const first = run(candles.slice(0, 3), config(levels));
    const restored: EngineState = JSON.parse(JSON.stringify(first.state));
    let state = restored;
    for (let i = 2; i < candles.length - 1; i++) state = stepBar(candles, i, false, false, state, config(levels)).state;
    expect(state.position?.quantity).toBe(whole.state.position?.quantity);
    expect(state.position?.targetsHit).toBe(whole.state.position?.targetsHit);
    expect(state.cash).toBeCloseTo(whole.state.cash, 6);
  });
});

describe("staged targets (short)", () => {
  it("mirrors a long: targets below the entry, lock above it", () => {
    const levels = [pct(5, 50), pct(10, 25)];
    const candles = [bar(0, 100, 100, 100, 100), bar(1, 100, 101, 99, 100), bar(2, 100, 100, 94.5, 95), bar(3, 95, 95.1, 94.9, 95), bar(4, 95, 95, 95, 95)];
    const { steps, state } = run(candles, config(levels, "SHORT"));
    const first = steps.find((s) => s.trade)!;
    expect(first.trade!.exitPrice).toBe(95);
    expect(first.trade!.quantity).toBe(50);
    expect(first.trade!.grossPnl).toBeCloseTo(250, 6);
    expect(steps.filter((s) => s.trade).at(-1)!.reason).toBe("locked_profit");
    expect(state.position).toBeNull();
  });
});

describe("helpers", () => {
  it("lockFloor never sits worse than the entry", () => {
    const level = pct(5, 25, { mode: "MARGIN", unit: "PERCENT", value: 4.9 });
    expect(lockFloor(level, 105, 100, undefined, "LONG")).toBeCloseTo(105 - 4.9, 6);
    const wide: TargetLevel = { unit: "POINTS", value: 5, exitPercent: 25, lock: { mode: "MARGIN", unit: "POINTS", value: 50 } };
    expect(lockFloor(wide, 105, 100, undefined, "LONG")).toBe(100);
    expect(lockFloor(wide, 95, 100, undefined, "SHORT")).toBe(100);
  });
  it("targetQuantity is a share of the original position, at least one, never more than is left", () => {
    expect(targetQuantity(pct(5, 25), 100, 100)).toBe(25);
    expect(targetQuantity(pct(5, 1), 10, 10)).toBe(1);
    expect(targetQuantity(pct(5, 50), 100, 30)).toBe(30);
  });
  it("targetsTakenFor reads the targets already taken from the shares already sold", () => {
    const levels = [pct(5, 25), pct(10, 25), pct(15, 25)];
    expect(targetsTakenFor(levels, 100, 100)).toBe(0);
    expect(targetsTakenFor(levels, 100, 75)).toBe(1);
    expect(targetsTakenFor(levels, 100, 50)).toBe(2);
    expect(targetsTakenFor(levels, 100, 60)).toBe(1);
    expect(targetsTakenFor(levels, 100, 25)).toBe(3);
  });
});
