import { describe, it, expect } from "vitest";
import { hma, keltnerChannels, ema, atr, awesomeOscillator, parabolicSar, supertrend } from "@/lib/indicators";
import type { Candle } from "@/lib/market-data";

/** Batch 7 (Phase B, final indicator batch): HMA, Keltner Channels,
 * Awesome Oscillator, Parabolic SAR, Supertrend. HMA is independently
 * hand-computed in exact fractions from its real definition (a WMA of
 * 2*WMA(period/2)-WMA(period), then WMA'd again over sqrt(period)).
 * Keltner is verified compositionally against the library's own
 * already-independently-verified ema()/atr() (documented as such — this
 * checks the composition/alignment logic, not the sub-formulas again).
 * Awesome Oscillator's periods (5, 34) aren't parameterized, so its
 * reference value is computed by a fresh, independent loop over the same
 * synthetic data rather than hand-typing 34 numbers. PSAR and Supertrend
 * are stateful/branching, so each gets a short, fully hand-traced case
 * through the real algorithm. */

function candle(time: number, high: number, low: number, close: number): Candle {
  return { time, open: close, high, low, close, volume: 0 };
}

describe("HMA — Hull Moving Average", () => {
  it("matches WMA(2*WMA(period/2) - WMA(period), sqrt(period)) exactly, in fractions", () => {
    const closes = [10, 20, 15, 25, 30, 20, 35];
    const candles = closes.map((c, i) => candle(i, c, c, c));
    // period=4 -> half=2, sqrtPeriod=2
    // wma(2): @1=50/3 @2=50/3 @3=65/3 @4=85/3 @5=70/3 @6=30
    // wma(4): @3=39/2 @4=49/2 @5=47/2 @6=57/2
    // raw = 2*wmaHalf - wmaFull, at times 3,4,5,6:
    //   @3: 2*65/3-39/2 = 143/6
    //   @4: 2*85/3-49/2 = 193/6
    //   @5: 2*70/3-47/2 = 139/6
    //   @6: 2*30-57/2   = 63/2
    // HMA = wma(raw, 2), denom=3:
    //   @4: (143/6*1 + 193/6*2)/3 = 529/18
    //   @5: (193/6*1 + 139/6*2)/3 = 471/18
    //   @6: (139/6*1 + 63/2*2)/3  = 517/18
    const result = hma(candles, 4);
    expect(result.map((p) => p.value)).toEqual([
      expect.closeTo(529 / 18, 6),
      expect.closeTo(471 / 18, 6),
      expect.closeTo(517 / 18, 6),
    ]);
    expect(result.map((p) => p.time)).toEqual([4, 5, 6]);
  });
});

describe("Keltner Channels (compositional check against independently-verified ema/atr)", () => {
  it("middle = EMA(period); upper/lower = middle +/- multiplier * ATR(period)", () => {
    const candles = [
      candle(0, 10, 8, 9),
      candle(1, 12, 9, 11),
      candle(2, 11, 9, 10.5),
      candle(3, 13, 10, 12),
    ];
    const expectedMiddle = ema(candles, 2);
    const expectedAtr = atr(candles, 2);
    const { upper, middle, lower } = keltnerChannels(candles, 2, 2);

    // Only times present in both series are expected to appear.
    const atrByTime = new Map(expectedAtr.map((p) => [p.time, p.value]));
    for (const p of expectedMiddle) {
      if (!atrByTime.has(p.time)) continue;
      const a = atrByTime.get(p.time)!;
      const m = middle.find((x) => x.time === p.time)!;
      const u = upper.find((x) => x.time === p.time)!;
      const l = lower.find((x) => x.time === p.time)!;
      expect(m.value).toBeCloseTo(p.value, 10);
      expect(u.value).toBeCloseTo(p.value + 2 * a, 10);
      expect(l.value).toBeCloseTo(p.value - 2 * a, 10);
    }
  });
});

describe("Awesome Oscillator — SMA(5) of midpoint minus SMA(34) of midpoint (fixed periods)", () => {
  it("matches an independently-looped reference over 40 synthetic bars", () => {
    // Linear ramp so the reference SMA loop below is trivial to get right
    // independently of the library's own implementation.
    const candles: Candle[] = Array.from({ length: 40 }, (_, i) => candle(i, i + 2, i, i + 1)); // midpoint = i+1
    const midpoints = candles.map((c) => (c.high + c.low) / 2);

    function referenceSma(period: number, at: number): number {
      let sum = 0;
      for (let j = at - period + 1; j <= at; j++) sum += midpoints[j];
      return sum / period;
    }

    const lastIdx = candles.length - 1;
    const expected = referenceSma(5, lastIdx) - referenceSma(34, lastIdx);

    const result = awesomeOscillator(candles);
    const last = result[result.length - 1];
    expect(last.time).toBe(lastIdx);
    expect(last.value).toBeCloseTo(expected, 10);
  });
});

describe("Parabolic SAR", () => {
  it("hand-traces a short uptrend into a reversal, matching the exact algorithm in indicators.ts", () => {
    const candles: Candle[] = [
      candle(0, 10, 8, 9),
      candle(1, 12, 9, 11), // close(11) >= close(0)(9) -> starts in uptrend
      candle(2, 11, 9.5, 10.5),
      candle(3, 9, 7, 7.5), // low(7) breaks below SAR -> reversal to downtrend
    ];
    // isUptrend=true (11>=9), sar=low0=8, extremePoint=high0=10, accel=0.02
    // i=1: sar=8+0.02*(10-8)=8.04 -> clamped to min(8.04, low0=8, low0=8)=8
    //   low1=9 !< 8 (no reversal); high1=12>extremePoint(10) -> extremePoint=12, accel=0.04
    //   push sar=8 @ time1
    // i=2: sar=8+0.04*(12-8)=8.16 -> clamped to min(8.16, low1=9, low0=8)=8
    //   low2=9.5 !< 8; high2=11 !> extremePoint(12) -> no change
    //   push sar=8 @ time2
    // i=3: sar=8+0.04*(12-8)=8.16 -> clamped to min(8.16, low2=9.5, low1=9)=8.16
    //   low3=7 < 8.16 -> REVERSE: sar=extremePoint(12), extremePoint=low3(7), accel resets to 0.02
    //   push sar=12 @ time3
    const result = parabolicSar(candles, 0.02, 0.2);
    expect(result.map((p) => p.value)).toEqual([8, 8, 12]);
    expect(result.map((p) => p.time)).toEqual([1, 2, 3]);
  });
});

describe("Supertrend", () => {
  it("hand-traces the first (unstarted-state) point exactly", () => {
    const candles: Candle[] = [
      candle(0, 10, 8, 9),
      candle(1, 12, 9, 11), // TR=max(3,3,0)=3
      candle(2, 11, 9.5, 10.5), // TR=max(1.5,0,1.5)=1.5
    ];
    // atr(period=2): seed = (3+1.5)/2 = 2.25 @ time2 (only point, 3 candles)
    // basicUpper = (11+9.5)/2 + 2*2.25 = 10.25+4.5 = 14.75
    // basicLower = 10.25-4.5 = 5.75
    // !started -> upperBand=basicUpper, lowerBand=basicLower
    // isUptrend = close(10.5) >= (14.75+5.75)/2=10.25 -> true -> value = lowerBand = 5.75
    const result = supertrend(candles, 2, 2);
    expect(result[0].value).toBeCloseTo(5.75, 10);
    expect(result[0].time).toBe(2);
  });

  it("ratchets the lower band forward (never retreats) while the uptrend holds, only flipping when close breaks it", () => {
    // A tried-and-discarded stronger property ("the stop never sits inside
    // the bar's own H-L range") turned out to be false: reproduced live,
    // a bar whose close exactly re-touches the ratcheted lower band without
    // closing below it legitimately has its low/high straddle that value —
    // the flip condition checks `close` only, not intrabar low/high. That's
    // correct Supertrend behavior (a trailing stop can be approached
    // closely without being hit), not a bug — the invariant below is the
    // one that actually always holds: in a sustained uptrend, the
    // reported (lower-band) value is monotonically non-decreasing bar to
    // bar, and every value is a real, finite number.
    const closes = [10, 11, 12, 13, 14, 15, 16];
    const candles = closes.map((c, i) => candle(i, c + 0.5, c - 0.5, c));
    const result = supertrend(candles, 3, 2);
    expect(result.every((p) => Number.isFinite(p.value))).toBe(true);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].value).toBeGreaterThanOrEqual(result[i - 1].value);
    }
  });
});
