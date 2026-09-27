import { describe, expect, it } from "vitest";
import type { Candle } from "@/lib/market-data";
import { atLevelSeries, supportResistance } from "./support-resistance";

/** Candles following a path of closes, with a small range around each. */
function path(closes: number[]): Candle[] {
  return closes.map((c, i) => ({ time: 1_700_000_000 + i * 86_400, open: c, high: c + 0.5, low: c - 0.5, close: c, volume: 1000 }));
}

// Falls to ~100 twice (two bounces = support), rises to ~120 twice (two rejections = resistance).
const closes = [
  115, 112, 109, 106, 103, 100, 103, 106, 109, 112, 115, 118, 120, 118, 115, 112, 109, 106, 103, 100.4, 103, 106, 109, 112, 115, 118,
  120.2, 118, 115, 112, 110, 108, 109, 110,
];
const candles = path(closes);

describe("supportResistance", () => {
  it("finds support where price bounced twice and resistance where it was rejected twice", () => {
    const { support, resistance } = supportResistance(candles, 3, 2, 1);
    const lastSupport = support.at(-1)!.value;
    const lastResistance = resistance.at(-1)!.value;
    expect(lastSupport).toBeGreaterThan(99);
    expect(lastSupport).toBeLessThan(100.5);
    expect(lastResistance).toBeGreaterThan(120);
    expect(lastResistance).toBeLessThan(121);
  });

  it("never uses the future: no level exists before the second bounce is confirmed", () => {
    const { support } = supportResistance(candles, 3, 2, 1);
    // The second low is at index 19; with strength 3 it's only known from index 22.
    const firstKnown = support[0]?.time;
    expect(firstKnown).toBeGreaterThanOrEqual(candles[22].time);
    // Adding future bars doesn't change earlier values.
    const shorter = supportResistance(candles.slice(0, 26), 3, 2, 1).support;
    const longer = new Map(support.map((p) => [p.time, p.value]));
    for (const p of shorter) expect(longer.get(p.time)).toBe(p.value);
  });

  it("gives no level when price never revisits a zone", () => {
    const trend = path(Array.from({ length: 40 }, (_, i) => 100 + i));
    const { support, resistance } = supportResistance(trend, 3, 2, 1);
    expect(support).toEqual([]);
    expect(resistance).toEqual([]);
  });
});

describe("atLevelSeries", () => {
  it("flags a candle that dips into support and holds", () => {
    const extended = path([...closes, 106, 103, 100.3, 103]);
    const at = atLevelSeries(extended, "SUPPORT", 1);
    expect(at[extended.length - 2]).toBe(true); // touched ~100 and closed there
    expect(at[extended.length - 1]).toBe(false); // bounced away
  });
});
