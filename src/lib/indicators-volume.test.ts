import { describe, it, expect } from "vitest";
import { mfi, chaikinMoneyFlow, aroon } from "@/lib/indicators";
import type { Candle } from "@/lib/market-data";

/** Batch 4 (Phase B): volume-weighted and trend-range indicators. Each
 * expected value is hand-computed from the indicator's standard
 * definition. */

function candle(time: number, high: number, low: number, close: number, volume: number): Candle {
  return { time, open: close, high, low, close, volume };
}

describe("MFI — Money Flow Index (volume-weighted RSI)", () => {
  it("matches 100 - 100/(1 + positiveFlow/negativeFlow) over the period window", () => {
    const candles = [
      candle(0, 10, 8, 9, 100), // TP = 9
      candle(1, 11, 9, 10, 200), // TP = 10 (up from 9) -> raw MF = 2000, positive
      candle(2, 9, 7, 8, 150), // TP = 8 (down from 10) -> raw MF = 1200, negative
      candle(3, 12, 10, 11, 300), // TP = 11 (up from 8) -> raw MF = 3300, positive
    ];
    // positiveFlow = 2000 + 3300 = 5300, negativeFlow = 1200
    // MFI = 100 - 100/(1 + 5300/1200) = 81.53846...
    const result = mfi(candles, 3);
    expect(result[0].value).toBeCloseTo(100 - 100 / (1 + 5300 / 1200), 6);
  });
});

describe("Chaikin Money Flow", () => {
  it("matches sum(moneyFlowMultiplier * volume) / sum(volume) over the period", () => {
    const candles = [
      candle(0, 10, 8, 9.5, 100), // mult = ((9.5-8)-(10-9.5))/(10-8) = (1.5-0.5)/2 = 0.5 -> MFV=50
      candle(1, 11, 9, 9.5, 200), // mult = ((9.5-9)-(11-9.5))/(11-9) = (0.5-1.5)/2 = -0.5 -> MFV=-100
      candle(2, 9, 7, 8.5, 150), // mult = ((8.5-7)-(9-8.5))/(9-7) = (1.5-0.5)/2 = 0.5 -> MFV=75
    ];
    // CMF = (50 - 100 + 75) / (100+200+150) = 25/450
    const result = chaikinMoneyFlow(candles, 3);
    expect(result[0].value).toBeCloseTo(25 / 450, 10);
  });

  it("returns 0 when total volume in the window is 0 rather than dividing by zero", () => {
    const candles = [candle(0, 10, 8, 9, 0), candle(1, 11, 9, 10, 0), candle(2, 9, 7, 8, 0)];
    const result = chaikinMoneyFlow(candles, 3);
    expect(result[0].value).toBe(0);
  });
});

describe("Aroon Up / Aroon Down", () => {
  it("matches 100*(period-(i-extremeIdx))/period for both up and down", () => {
    const highs = [10, 15, 9, 12];
    const lows = [8, 10, 7, 9];
    const candles = highs.map((h, i) => candle(i, h, lows[i], h, 0));
    // period=3, window is indices 0..3 (period+1 bars):
    // highs 10,15,9,12 -> highest at index 1 (15) -> up = 100*(3-(3-1))/3 = 100/3
    // lows 8,10,7,9 -> lowest at index 2 (7) -> down = 100*(3-(3-2))/3 = 200/3
    const { up, down } = aroon(candles, 3);
    expect(up[0].value).toBeCloseTo(100 / 3, 6);
    expect(down[0].value).toBeCloseTo(200 / 3, 6);
  });
});
