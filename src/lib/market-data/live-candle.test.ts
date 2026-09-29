import { describe, expect, it } from "vitest";
import { applyTicks, bucketStart } from "./live-candle";

const ist = (s: string) => Date.parse(`${s}+05:30`) / 1000;
const tick = (t: string, price: number, volume = 10) => ({ time: ist(t), price, volume, bid: null, ask: null, bidQty: null, askQty: null });

describe("bucketStart", () => {
  it("aligns to the 09:15 open", () => {
    expect(bucketStart(ist("2026-09-29T09:31:40"), "15m")).toBe(ist("2026-09-29T09:30:00"));
    expect(bucketStart(ist("2026-09-29T10:14:59"), "60m")).toBe(ist("2026-09-29T09:15:00"));
    expect(bucketStart(ist("2026-09-29T13:20:00"), "4h")).toBe(ist("2026-09-29T13:15:00"));
    expect(bucketStart(ist("2026-09-29T14:00:00"), "1d")).toBe(ist("2026-09-29T09:15:00"));
    expect(bucketStart(ist("2026-09-29T09:10:00"), "5m")).toBeNull();
    expect(bucketStart(ist("2026-09-29T11:00:00"), "1wk")).toBeNull();
  });
});

describe("applyTicks", () => {
  const last = { time: ist("2026-09-29T11:00:00"), open: 100, high: 101, low: 99, close: 100, volume: 500 };
  it("extends the current candle and starts new ones", () => {
    const r = applyTicks(last, [tick("2026-09-29T11:00:30", 102), tick("2026-09-29T11:00:50", 98, 5), tick("2026-09-29T11:01:02", 97, 7)], "1m");
    expect(r.closed).toEqual([{ ...last, high: 102, low: 98, close: 98, volume: 515 }]);
    expect(r.forming).toEqual({ time: ist("2026-09-29T11:01:00"), open: 97, high: 97, low: 97, close: 97, volume: 7 });
  });
  it("ignores ticks for finished candles and starts from nothing", () => {
    expect(applyTicks(last, [tick("2026-09-29T10:59:00", 50)], "1m")).toEqual({ closed: [], forming: last });
    expect(applyTicks(null, [tick("2026-09-29T11:00:05", 10)], "5m").forming?.time).toBe(ist("2026-09-29T11:00:00"));
  });
});
