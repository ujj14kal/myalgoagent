import { describe, expect, it } from "vitest";
import type { Candle } from "@/lib/market-data";
import { stepBar, type EngineConfig, type EngineState, type EngineTrade, type ExitReason } from "./step";

// Two IST trading days of 15-minute candles, 09:15 … 15:15, flat price 100.
const DAY1_OPEN = Date.UTC(2026, 8, 24, 3, 45) / 1000; // 24 Sep 09:15 IST
const bars: Candle[] = [0, 1].flatMap((d) =>
  Array.from({ length: 25 }, (_, k) => {
    const t = DAY1_OPEN + d * 86400 + k * 900;
    return { time: t, open: 100, high: 100.5, low: 99.5, close: 100, volume: 1000 };
  }),
);
const minuteOf = (i: number) => 9 * 60 + 15 + (i % 25) * 15;

const base: EngineConfig = { brokeragePercent: 0, slippagePercent: 0, positionSizing: { mode: "FIXED_QUANTITY", value: 1 } };

/** Runs the engine with an entry signal on the given bars and never an exit signal. */
function run(entryBars: number[], config: EngineConfig) {
  let state: EngineState = { cash: 100_000, position: null };
  const fills: { entryMinute: number; exitMinute: number; reason?: ExitReason; trade: EngineTrade }[] = [];
  for (let i = 0; i < bars.length; i++) {
    const r = stepBar(bars, i, entryBars.includes(i), false, state, config);
    state = r.state;
    if (r.trade) {
      const entryIdx = bars.findIndex((b) => b.time === r.trade!.entryTime);
      const exitIdx = bars.findIndex((b) => b.time === r.trade!.exitTime);
      fills.push({ entryMinute: minuteOf(entryIdx), exitMinute: minuteOf(exitIdx), reason: r.exitReason, trade: r.trade });
    }
  }
  return { fills, open: state.position };
}

describe("intraday session rules", () => {
  it("squares off at the square-off time", () => {
    const { fills } = run([4], { ...base, session: { squareOffMinute: 14 * 60 + 30, flatOvernight: true } }); // signal 10:15 → fill 10:30
    expect(fills).toHaveLength(1);
    expect(fills[0].entryMinute).toBe(10 * 60 + 30);
    expect(fills[0].exitMinute).toBe(14 * 60 + 30);
    expect(fills[0].reason).toBe("square_off");
  });

  it("closes on the day's last candle when data ends before the square-off time", () => {
    const { fills } = run([4], { ...base, session: { squareOffMinute: 15 * 60 + 20, flatOvernight: true } });
    expect(fills[0].exitMinute).toBe(15 * 60 + 15); // last candle of the day
    expect(fills[0].trade.exitTime).toBe(bars[24].time);
  });

  it("blocks entries at or after the no-entry-after time", () => {
    const { fills, open } = run([20], { ...base, session: { noEntryAfterMinute: 14 * 60 + 30, flatOvernight: true } }); // fill would be 14:30
    expect(fills).toHaveLength(0);
    expect(open).toBeNull();
    // Signal on bar 19 fills at 14:15 — allowed (and closed by the day's last candle).
    expect(run([19], { ...base, session: { noEntryAfterMinute: 14 * 60 + 30, flatOvernight: true } }).fills[0].entryMinute).toBe(14 * 60 + 15);
  });

  it("never opens a position on the next day from the previous day's last candle", () => {
    const { fills, open } = run([24], { ...base, session: { flatOvernight: true } });
    expect(fills).toHaveLength(0);
    expect(open).toBeNull();
  });

  it("changes nothing for daily strategies (no session)", () => {
    const { fills, open } = run([4], base);
    expect(fills).toHaveLength(0);
    expect(open).not.toBeNull(); // still open: no time-of-day rules apply
  });
});

describe("opening entries", () => {
  it("a strategy that enters at the open fills at today's first candle from yesterday's last one", () => {
    const { fills } = run([24], { ...base, session: { allowOpeningEntry: true, squareOffMinute: 9 * 60 + 30, flatOvernight: true } });
    expect(fills).toHaveLength(1);
    expect(fills[0].entryMinute).toBe(9 * 60 + 15);
    expect(fills[0].exitMinute).toBe(9 * 60 + 30);
  });
});

describe("delivery on an intraday timeframe", () => {
  it("holds overnight: no square-off, no day-end close", () => {
    const { fills, open } = run([4], { ...base, session: { flatOvernight: false } });
    expect(fills).toHaveLength(0);
    expect(open).not.toBeNull();
  });
});

describe("limit entry orders (DAY validity)", () => {
  /** Same two days of candles, with a dip on day 1 at bar `dipAt` (low `dipLow`, open `dipOpen`). */
  function withDip(dipAt: number, dipLow: number, dipOpen = 100): Candle[] {
    return bars.map((b, i) => (i === dipAt ? { ...b, open: dipOpen, low: dipLow } : b));
  }
  function runOn(candles: Candle[], entryBars: number[], config: EngineConfig) {
    let state: EngineState = { cash: 100_000, position: null };
    let entry: { idx: number; price: number } | null = null;
    for (let i = 0; i < candles.length; i++) {
      state = stepBar(candles, i, entryBars.includes(i), false, state, config).state;
      if (!entry && state.position) entry = { idx: state.position.entryIdx, price: state.position.entryPrice };
    }
    return { entry, pending: state.pendingEntry ?? null };
  }
  const limit1pct: EngineConfig = { ...base, entryOrder: { type: "LIMIT", mode: "PERCENT", value: 1 } }; // buy at 99 (close 100)

  it("rests after the signal and fills later that day at the limit", () => {
    const { entry } = runOn(withDip(10, 98.5), [4], limit1pct);
    expect(entry).toEqual({ idx: 10, price: 99 });
  });

  it("fills at the open when price gaps through the limit (a better price)", () => {
    const { entry } = runOn(withDip(10, 97, 97.5), [4], limit1pct);
    expect(entry).toEqual({ idx: 10, price: 97.5 });
  });

  it("is cancelled at the end of the day if never reached", () => {
    const { entry, pending } = runOn(withDip(30, 98.5), [4], limit1pct); // dip only on day 2
    expect(entry).toBeNull();
    expect(pending).toBeNull();
  });

  it("supports a fixed ₹ limit price", () => {
    const { entry } = runOn(withDip(12, 98), [4], { ...base, entryOrder: { type: "LIMIT", mode: "PRICE", value: 98.2 } });
    expect(entry).toEqual({ idx: 12, price: 98.2 });
  });

  it("a short's limit sits above the price", () => {
    const spike = bars.map((b, i) => (i === 9 ? { ...b, high: 101.5 } : b));
    const { entry } = runOn(spike, [4], { ...limit1pct, direction: "SHORT" }); // sell at 101
    expect(entry).toEqual({ idx: 9, price: 101 });
  });
});
