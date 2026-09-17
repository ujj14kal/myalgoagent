import { describe, it, expect } from "vitest";
import { adx } from "@/lib/indicators";
import type { Candle } from "@/lib/market-data";

/** Batch 6 (Phase B): ADX / +DI / -DI. This is the indicator most likely to
 * hide a subtle bug — it layers directional-movement logic (which of
 * up-move/down-move "wins" a given bar) on top of Wilder's smoothing
 * recursion, then feeds the result into a further EMA for the ADX line
 * itself. Hand-traced in exact fractions across 4 bars / 2 smoothing
 * steps, covering a bar where the up-move wins, one where the down-move
 * wins, and one where up wins again. */

function candle(time: number, high: number, low: number, close: number): Candle {
  return { time, open: close, high, low, close, volume: 0 };
}

describe("ADX / +DI / -DI", () => {
  it("hand-traces directional movement + Wilder smoothing across 2 steps (period=2)", () => {
    const candles: Candle[] = [
      candle(0, 10, 8, 9),
      candle(1, 12, 9, 11), // upMove=2, downMove=-1 -> +DM=2, -DM=0; TR=max(3,3,0)=3
      candle(2, 11, 8, 9.5), // upMove=-1, downMove=1 -> +DM=0, -DM=1; TR=max(3,0,3)=3
      candle(3, 13, 10, 12), // upMove=2, downMove=-2 -> +DM=2, -DM=0; TR=max(3,3.5,0.5)=3.5
    ];

    // Seed (period=2, bars 1-2): smoothedPlusDM=2+0=2, smoothedMinusDM=0+1=1, smoothedTR=3+3=6
    // pDI@2 = 100*2/6 = 100/3; mDI@2 = 100*1/6 = 50/3
    // dx@2 = 100*|100/3-50/3|/(100/3+50/3) = 100*(50/3)/50 = 100/3
    //
    // Step i=3: +DM=2, -DM=0, TR=3.5
    // smoothedTR = 6 - 6/2 + 3.5 = 6.5
    // smoothedPlusDM = 2 - 2/2 + 2 = 3
    // smoothedMinusDM = 1 - 1/2 + 0 = 0.5
    // pDI@3 = 100*3/6.5 = 600/13; mDI@3 = 100*0.5/6.5 = 100/13
    // dx@3 = 100*|600/13-100/13|/(600/13+100/13) = 100*(500/13)/(700/13) = 500/7
    //
    // adxLine = EMA-seed of [dx@2, dx@3] with period=2 -> avg(100/3, 500/7)
    const { adx: adxLine, plusDI, minusDI } = adx(candles, 2);

    expect(plusDI.map((p) => p.value)).toEqual([expect.closeTo(100 / 3, 8), expect.closeTo(600 / 13, 8)]);
    expect(minusDI.map((p) => p.value)).toEqual([expect.closeTo(50 / 3, 8), expect.closeTo(100 / 13, 8)]);
    expect(adxLine[0].value).toBeCloseTo((100 / 3 + 500 / 7) / 2, 8);
    expect(adxLine[0].time).toBe(3);
  });

  it("assigns the full directional movement to whichever of up/down-move is larger, never both", () => {
    // A pure up-move bar: high rises, low doesn't fall below the prior low.
    const candles: Candle[] = [candle(0, 10, 8, 9), candle(1, 15, 9, 12), candle(2, 20, 10, 15)];
    const { plusDI, minusDI } = adx(candles, 1);
    // Every bar here is a clean up-move, so -DI must be 0 throughout.
    expect(minusDI.every((p) => p.value === 0)).toBe(true);
    expect(plusDI.every((p) => p.value > 0)).toBe(true);
  });
});
