import { describe, expect, it } from "vitest";
import { findEntryIndex, snapFormingCandle } from "./sync";

const c = (time: number) => ({ time });

describe("forming candle stamped at its last trade (Yahoo)", () => {
  it("snaps it back onto the minute grid", () => {
    const out = snapFormingCandle([c(1791175080), c(1791175140), c(1791175243)], "1m");
    expect(out.at(-1)!.time).toBe(1791175200);
  });
  it("leaves candles already on the grid alone", () => {
    const list = [c(1791175080), c(1791175140), c(1791175200)];
    expect(snapFormingCandle(list, "1m")).toEqual(list);
  });
  it("snaps on the grid of a longer timeframe counted from the previous candle", () => {
    expect(snapFormingCandle([c(0), c(900), c(900 + 900 + 37)], "15m").at(-1)!.time).toBe(1800);
  });
  it("finds a position entered on a mis-stamped candle again (the live TATASTEEL case)", () => {
    const candles = [c(1791175140), c(1791175200), c(1791175260)];
    expect(findEntryIndex(candles, 1791175212, "1m")).toBe(1);
    expect(findEntryIndex(candles, 1791175140, "1m")).toBe(0);
    expect(findEntryIndex(candles, 1791170000, "1m")).toBe(-1);
  });
});
