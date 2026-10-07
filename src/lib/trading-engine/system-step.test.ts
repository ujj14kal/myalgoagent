import { describe, expect, it } from "vitest";
import type { Candle } from "@/lib/market-data";
import type { EngineConfig } from "./step";
import { startSystem, stepSystemBar, systemSignals, type SystemRules, type SystemSignals, type SystemStepResult } from "./system-step";

// Intraday 5-minute candles from 09:15 IST, flat prices unless given.
const T0 = Date.parse("2026-10-07T09:15:00+05:30") / 1000;
const bars = (closes: number[]): Candle[] => closes.map((p, i) => ({ time: T0 + i * 300, open: p, high: p + 0.5, low: p - 0.5, close: p, volume: 1000 }));
const config: EngineConfig = { brokeragePercent: 0, slippagePercent: 0, positionSizing: { mode: "FIXED_QUANTITY", value: 10 } };
const rules = (over: Partial<SystemRules> = {}): SystemRules => ({
  conflict: { rule: "IGNORE", confirmBars: 1 },
  opposite: { whenLong: "EXIT", whenShort: "EXIT", confirmBars: 0 },
  allowShort: true,
  entryWindows: [],
  noTradeWindows: [],
  ...over,
});
/** A candle's signals; a side that fires on this candle is also valid on it unless said otherwise. */
const sig = (s: Partial<SystemSignals> = {}): SystemSignals => ({ bull: false, bear: false, bullValid: !!s.bull, bearValid: !!s.bear, bullConfidence: 1, bearConfidence: 1, bullRank: 0, bearRank: 0, bullSince: null, bearSince: null, ...s });

function run(candles: Candle[], signals: SystemSignals[], r: SystemRules) {
  let state = startSystem(100_000);
  const steps: SystemStepResult[] = [];
  for (let i = 0; i < candles.length - 1; i++) {
    const res = stepSystemBar(candles, i, signals[i] ?? sig(), state, config, r);
    state = res.system;
    steps.push(res);
  }
  return { steps, state };
}

describe("position state", () => {
  it("flat + bullish opens a long; long + bearish exits it (EXIT)", () => {
    const candles = bars([100, 100, 102, 104, 104, 104]);
    const { steps, state } = run(candles, [sig({ bull: true }), sig(), sig(), sig({ bear: true })], rules());
    expect(steps[0].opened).toBe("LONG");
    const exit = steps.find((s) => s.trade)!;
    expect([exit.systemExit, exit.tradeSide, exit.trade!.exitPrice, exit.trade!.netPnl]).toEqual(["opposite_signal", "LONG", 104, 40]);
    expect(state.side).toBeNull();
  });
  it("REVERSE: the long closes and a short opens at the same next open", () => {
    const candles = bars([100, 100, 104, 104, 100, 98, 98]);
    const { steps, state } = run(candles, [sig({ bull: true }), sig(), sig(), sig({ bear: true }), sig(), sig()], rules({ opposite: { whenLong: "REVERSE", whenShort: "EXIT", confirmBars: 0 } }));
    const rev = steps[3];
    expect([rev.systemExit, rev.tradeSide, rev.opened]).toEqual(["reversal", "LONG", "SHORT"]);
    // Signalled at candle 3's close: both the exit and the new short fill at candle 4's open (100).
    expect(rev.trade!.exitPrice).toBe(100);
    expect(state.side).toBe("SHORT");
    expect(state.engine.position).toMatchObject({ entryPrice: 100, quantity: 10 });
  });
  it("delivery (no shorts): bearish setups only close longs, and REVERSE just exits", () => {
    const candles = bars([100, 100, 104, 104, 104]);
    const r = rules({ allowShort: false, opposite: { whenLong: "REVERSE", whenShort: "EXIT", confirmBars: 0 } });
    const { steps, state } = run(candles, [sig({ bear: true }), sig({ bull: true }), sig(), sig({ bear: true })], r);
    expect(steps[0].opened).toBeUndefined(); // flat + bearish: no short
    expect(steps[3].systemExit).toBe("opposite_signal");
    expect(state.side).toBeNull();
  });
  it("IGNORE keeps the position; a same-side setup adds when pyramiding is allowed", () => {
    const candles = bars([100, 100, 101, 102, 103]);
    const { state } = run(candles, [sig({ bull: true }), sig({ bear: true }), sig({ bull: true })], rules({ opposite: { whenLong: "IGNORE", whenShort: "EXIT", confirmBars: 0 } }));
    expect(state.side).toBe("LONG");
    expect(state.engine.position?.quantity).toBe(10);
    let st = startSystem(100_000);
    for (let i = 0; i < 3; i++) st = stepSystemBar(candles, i, i === 1 ? sig({ bull: true }) : i === 0 ? sig({ bull: true }) : sig(), st, { ...config, maxPyramidEntries: 2 }, rules()).system;
    expect(st.engine.position?.quantity).toBe(20);
  });
  it("wait for confirmation: the opposite setup must hold N candles before acting", () => {
    const candles = bars([100, 100, 101, 102, 103, 104, 105]);
    const r = rules({ opposite: { whenLong: "EXIT", whenShort: "EXIT", confirmBars: 1 } });
    const { steps } = run(candles, [sig({ bull: true }), sig(), sig({ bear: true }), sig(), sig({ bear: true }), sig({ bearValid: true })], r);
    // A single bearish candle (2) is not enough; two in a row (4, 5) is: exits at 5's signal.
    expect(steps.findIndex((s) => s.systemExit)).toBe(5);
  });
});

describe("conflict between bullish and bearish setups", () => {
  const candles = bars([100, 100, 100, 100, 100]);
  const both = (s: Partial<SystemSignals> = {}) => sig({ bull: true, bear: true, bullSince: 0, bearSince: 0, ...s });
  const opened = (rule: SystemRules["conflict"]["rule"], s: SystemSignals, confirmBars = 1) => run(candles, [s], rules({ conflict: { rule, confirmBars } })).steps[0].opened;
  it("bullish / bearish priority", () => {
    expect(opened("BULLISH", both())).toBe("LONG");
    expect(opened("BEARISH", both())).toBe("SHORT");
  });
  it("first signal, higher timeframe, stronger confidence — and ties are ignored", () => {
    expect(opened("FIRST", both({ bullSince: 0, bearSince: 1 }))).toBe("LONG");
    expect(opened("FIRST", both())).toBeUndefined();
    expect(opened("HIGHER_TIMEFRAME", both({ bearRank: 2 }))).toBe("SHORT");
    expect(opened("CONFIDENCE", both({ bullConfidence: 0.5, bearConfidence: 0.25 }))).toBe("LONG");
    expect(opened("IGNORE", both())).toBeUndefined();
  });
  it("WAIT: enters once one side has stayed valid on its own for N candles", () => {
    const { steps } = run(candles, [both(), sig({ bullValid: true }), sig({ bullValid: true })], rules({ conflict: { rule: "WAIT", confirmBars: 2 } }));
    expect(steps.map((s) => s.opened ?? null)).toEqual([null, null, "LONG", null]);
  });
  it("a new setup conflicts with the other side still being valid from earlier", () => {
    expect(run(candles, [sig({ bear: true, bullValid: true, bullSince: 0, bearSince: 1 })], rules({ conflict: { rule: "FIRST", confirmBars: 1 } })).steps[0].opened).toBe("LONG");
    expect(run(candles, [sig({ bear: true, bullValid: true })], rules({ conflict: { rule: "IGNORE", confirmBars: 1 } })).steps[0].opened).toBeUndefined();
  });
});

describe("sessions", () => {
  it("no entry whose fill falls in a no-trade period, or outside the trading windows", () => {
    const candles = bars([100, 100, 100, 100]);
    // Fill of a signal on candle 0 is candle 1 at 09:20.
    expect(run(candles, [sig({ bull: true })], rules({ noTradeWindows: [{ startMinute: 9 * 60 + 15, endMinute: 9 * 60 + 30 }] })).steps[0].opened).toBeUndefined();
    expect(run(candles, [sig({ bull: true })], rules({ entryWindows: [{ startMinute: 10 * 60, endMinute: 11 * 60 }] })).steps[0].opened).toBeUndefined();
    expect(run(candles, [sig({ bull: true })], rules({ entryWindows: [{ startMinute: 9 * 60 + 15, endMinute: 11 * 60 }] })).steps[0].opened).toBe("LONG");
  });
});

describe("signals from concepts", () => {
  it("combine sides, take the best confidence and rank, and track when each run began", () => {
    const s = systemSignals(
      [
        { side: "BULLISH", valid: [false, true, true], optionals: [[true, true, false], [false, false, false]], timeframeRank: 0 },
        { side: "BULLISH", valid: [false, false, true], optionals: [], timeframeRank: 2 },
        { side: "BEARISH", valid: [true, false, true], optionals: [], timeframeRank: 1 },
      ],
      3,
    );
    expect(s[1]).toMatchObject({ bull: true, bullValid: true, bear: false, bullConfidence: 0.5, bullRank: 0, bullSince: 1 });
    // A second bullish concept becoming valid is a new setup (it fires); the first is still valid. Bearish fired again after a gap.
    expect(s[2]).toMatchObject({ bull: true, bullValid: true, bear: true, bearValid: true, bullConfidence: 1, bullRank: 2, bullSince: 1, bearSince: 2 });
  });
});

describe("how a concept's entry is considered", () => {
  const one = (valid: boolean[], entry?: { trigger: "FORMED" | "WHILE_VALID"; confirmBars: number }) => systemSignals([{ side: "BULLISH", valid, optionals: [], timeframeRank: 0, entry }], valid.length).map((x) => x.bull);
  it("once, when it becomes valid (default)", () => expect(one([false, true, true, true, false, true])).toEqual([false, true, false, false, false, true]));
  it("on every candle it is valid", () => expect(one([false, true, true, false, true], { trigger: "WHILE_VALID", confirmBars: 0 })).toEqual([false, true, true, false, true]));
  it("only after it has held N more candles", () => {
    expect(one([true, true, true, true], { trigger: "FORMED", confirmBars: 2 })).toEqual([false, false, true, false]);
    expect(one([true, true, false, true, true, true], { trigger: "WHILE_VALID", confirmBars: 1 })).toEqual([false, true, false, false, true, true]);
  });
  it("an exit-only concept never signals an entry but is reported while valid", () => {
    const s = systemSignals([{ side: "BEARISH", valid: [false, true, true], optionals: [], timeframeRank: 0, role: "EXIT" }], 3);
    expect(s.map((x) => [x.bear, x.bearValid, x.bearExit])).toEqual([[false, false, false], [false, false, true], [false, false, true]]);
  });
});

describe("an exit-only concept", () => {
  it("closes a long even where opposite setups are ignored, and never reverses it", () => {
    const candles = bars([100, 100, 104, 104, 100, 98, 98]);
    const r = rules({ opposite: { whenLong: "IGNORE", whenShort: "IGNORE", confirmBars: 3 } });
    const { steps, state } = run(candles, [sig({ bull: true }), sig(), sig(), sig({ bearExit: true }), sig(), sig()], r);
    const exit = steps.find((x) => x.trade)!;
    expect([exit.systemExit, exit.tradeSide, exit.opened]).toEqual(["opposite_signal", "LONG", undefined]);
    expect(state.side).toBeNull();
  });
});
