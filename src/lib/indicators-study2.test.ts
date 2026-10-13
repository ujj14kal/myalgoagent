import { describe, expect, it } from "vitest";
import type { Candle } from "@/lib/market-data";
import { ema, macd, rsi, sma } from "@/lib/indicators";
import {
  bollingerEx,
  bollingerWM,
  divergenceFlags,
  fibonacciLevels,
  macdEx,
  manualFibGoldenZone,
  manualFibLevel,
  periodVwap,
  ppo,
  priceBySource,
  pricePivots,
  rsiEx,
  vwapFromDate,
  vwapFromSwing,
  withSource,
} from "@/lib/indicators-study";
import { computeIndicatorSeries } from "@/lib/strategy/compute-series";
import { validateConditionNode } from "@/lib/strategy/validate";
import { parseDsl } from "@/lib/strategy/dsl";

const k = (time: number, o: number, h: number, l: number, c: number, volume = 100): Candle => ({ time, open: o, high: h, low: l, close: c, volume });
const flatC = (time: number, close: number, volume = 100): Candle => k(time, close, close, close, close, volume);
const closes = (arr: number[]) => arr.map((x, i) => flatC(1_700_000_000 + i * 86_400, x));

describe("source and average options", () => {
  it("reads high+low / 2, hlc3 and ohlc4 as the study lists them", () => {
    const c = k(0, 10, 20, 8, 14);
    expect(priceBySource(c, 0)).toBe(14);
    expect(priceBySource(c, 1)).toBe(14);
    expect(priceBySource(c, 2)).toBeCloseTo((20 + 8 + 14) / 3, 10);
    expect(priceBySource(c, 3)).toBeCloseTo((10 + 20 + 8 + 14) / 4, 10);
    expect(withSource([c], 2)[0].close).toBeCloseTo(14, 10);
  });
  it("RSI: Wilder (default) equals the existing RSI; SMA and EMA smoothing give their own, finite values", () => {
    const data = closes([44, 44.34, 44.09, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46, 46.03, 46.41, 46.22, 45.64]);
    expect(rsiEx(data, 14, 0, 0)).toEqual(rsi(data, 14));
    const s = rsiEx(data, 14, 0, 1);
    const e = rsiEx(data, 14, 0, 2);
    expect(s.length).toBe(rsi(data, 14).length);
    expect(s.every((p) => p.value >= 0 && p.value <= 100)).toBe(true);
    expect(e.every((p) => p.value >= 0 && p.value <= 100)).toBe(true);
    expect(s.at(-1)!.value).not.toBeCloseTo(rsi(data, 14).at(-1)!.value, 3);
  });
  it("MACD: EMA default equals the existing MACD; SMA mode uses simple averages", () => {
    const data = closes(Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 5) * 5 + i * 0.1));
    expect(macdEx(data, 12, 26, 9, 0, 0).macd).toEqual(macd(data, 12, 26, 9).macd);
    const m = macdEx(data, 12, 26, 9, 0, 1);
    const f = sma(data, 12);
    const sl = sma(data, 26);
    expect(m.macd[0].value).toBeCloseTo(f.find((p) => p.time === sl[0].time)!.value - sl[0].value, 10);
    expect(m.histogram.at(-1)!.value).toBeCloseTo(m.macd.at(-1)!.value - m.signal.at(-1)!.value, 10);
  });
  it("Bollinger: SMA default unchanged; EMA middle line differs and the bands stay symmetric around it", () => {
    const data = closes(Array.from({ length: 40 }, (_, i) => 100 + Math.sin(i / 3) * 4));
    const b = bollingerEx(data, 20, 2, 0, 1);
    const emaLast = ema(data, 20).at(-1)!.value;
    expect(b.middle.at(-1)!.value).toBeCloseTo(emaLast, 10);
    expect(b.upper.at(-1)!.value - b.middle.at(-1)!.value).toBeCloseTo(b.middle.at(-1)!.value - b.lower.at(-1)!.value, 10);
  });
});

describe("PPO", () => {
  it("is MACD as a percent of the slow average: (fast - slow) / slow x 100", () => {
    const data = closes(Array.from({ length: 50 }, (_, i) => 100 + i));
    const p = ppo(data, 12, 26, 9);
    const f = ema(data, 12).find((x) => x.time === ema(data, 26)[0].time)!.value;
    const s = ema(data, 26)[0].value;
    expect(p.line[0].value).toBeCloseTo(((f - s) / s) * 100, 10);
    expect(p.histogram.at(-1)!.value).toBeCloseTo(p.line.at(-1)!.value - p.signal.at(-1)!.value, 10);
  });
});

describe("divergence", () => {
  // Two price lows, the second lower, while the oscillator's second low is higher.
  const candles: Candle[] = [];
  const lows = [50, 49, 48, 47, 46, 45, 46, 47, 48, 49, 48, 47, 46, 45, 44, 43, 44, 45, 46, 47, 48, 49, 50, 51];
  lows.forEach((l, i) => candles.push(k(i, l + 1, l + 2, l, l + 1)));
  const osc = (valAtFirst: number, valAtSecond: number) => candles.map((c, i) => ({ time: c.time, value: i === 5 ? valAtFirst : i === 15 ? valAtSecond : 50 }));
  it("flags a bullish divergence on the candle it is confirmed (right candles after the second pivot)", () => {
    const flags = divergenceFlags(candles, osc(20, 30), 3, 3, 60, true);
    const hit = flags.filter((f) => f.value === 1);
    expect(hit).toHaveLength(1);
    expect(hit[0].time).toBe(18); // pivot at 15 confirmed at 15 + 3
  });
  it("does not flag when the oscillator makes a lower low too", () => {
    expect(divergenceFlags(candles, osc(30, 20), 3, 3, 60, true).every((f) => f.value === 0)).toBe(true);
  });
  it("ignores pivots that are too far apart", () => {
    expect(divergenceFlags(candles, osc(20, 30), 3, 3, 5, true).every((f) => f.value === 0)).toBe(true);
  });
  it("finds pivot lows from the surrounding candles only", () => {
    expect(pricePivots(candles, 3, 3, "low").map((p) => p.index)).toEqual([5, 15]);
  });
});

describe("Bollinger W-bottom / M-top", () => {
  it("returns a 0/1 series from the first band value on", () => {
    const data = closes(Array.from({ length: 80 }, (_, i) => 100 + Math.sin(i / 2.5) * 6));
    const w = bollingerWM(data, 10, 2, 3, 3, 60, false);
    expect(w.length).toBeGreaterThan(0);
    expect(w.every((p) => p.value === 0 || p.value === 1)).toBe(true);
    expect(bollingerWM(data.slice(0, 5), 10, 2, 3, 3, 60, true)).toEqual([]);
  });
});

describe("Anchored VWAPs", () => {
  const DAY = 86_400;
  const mon = Date.UTC(2026, 9, 12, 4, 0, 0) / 1000; // Monday 12 Oct 2026, 09:30 IST
  it("weekly VWAP restarts on Monday and accumulates through the week", () => {
    const week1 = [0, 1, 2, 3, 4].map((d) => flatC(mon + d * DAY, 100 + d));
    const week2 = [7, 8].map((d) => flatC(mon + d * DAY, 200 + d));
    const v = periodVwap([...week1, ...week2], "week");
    expect(v[4].value).toBeCloseTo((100 + 101 + 102 + 103 + 104) / 5, 10);
    expect(v[5].value).toBeCloseTo(207, 10);
  });
  it("anchored from a date starts exactly on that Indian date", () => {
    const data = [0, 1, 2].map((d) => flatC(mon + d * DAY, 100 + 10 * d));
    const v = vwapFromDate(data, 20261013); // Tuesday
    expect(v).toHaveLength(2);
    expect(v[0].value).toBeCloseTo(110, 10);
    expect(v[1].value).toBeCloseTo(115, 10);
    expect(vwapFromDate(data, 20261399)).toEqual([]);
  });
  it("anchored at a swing starts only once the swing is confirmed", () => {
    const lowsData: Candle[] = [];
    [60, 58, 56, 54, 52, 50, 52, 54, 56, 58, 60, 62].forEach((l, i) => lowsData.push(k(i, l + 1, l + 2, l, l + 1)));
    const v = vwapFromSwing(lowsData, 3, 3, "low");
    expect(v[0].time).toBe(8); // low at 5 confirmed at 5 + 3
  });
});

describe("Fibonacci extras", () => {
  const candles: Candle[] = [];
  for (let i = 0; i < 6; i++) candles.push(k(i, 110 - i, 111 - i, 109 - i, 110 - i));
  candles.push(k(6, 101, 102, 100, 101));
  for (let i = 7; i <= 22; i++) candles.push(k(i, 100 + (i - 6) * 6, 101 + (i - 6) * 6, 99 + (i - 6) * 6, 100 + (i - 6) * 6));
  candles.push(k(23, 199, 200, 198, 199));
  for (let i = 24; i < 34; i++) candles.push(k(i, 190 - (i - 24), 192 - (i - 24), 188 - (i - 24), 190 - (i - 24)));
  it("swing age counts the candles since the swing end was confirmed", () => {
    const f = fibonacciLevels(candles, 3, 3, 1);
    const ages = f.age.map((p) => p.value);
    expect(ages[0]).toBe(0);
    expect(ages.at(-1)).toBeGreaterThan(5);
  });
  it("cluster flag is 0/1 and needs levels of at least two swings", () => {
    const f = fibonacciLevels(candles, 3, 3, 1);
    expect(f.confluence.every((p) => p.value === 0 || p.value === 1)).toBe(true);
  });
  it("manual swing levels use the prices you type in", () => {
    const lvl = manualFibLevel(candles, 100, 200, 618);
    expect(lvl[0].value).toBeCloseTo(138.2, 1);
    expect(manualFibLevel(candles, 100, 200, 1272)[0].value).toBeCloseTo(227.2, 1);
    expect(manualFibLevel(candles, 200, 100, 618)[0].value).toBeCloseTo(161.8, 1); // a down-swing mirrors
    const zone = manualFibGoldenZone([k(20, 145, 150, 140, 145), ...candles.slice(0, 20)].sort((a, b) => a.time - b.time), 100, 200);
    expect(zone.every((p) => p.value === 0 || p.value === 1)).toBe(true);
  });
});

describe("new settings in rules", () => {
  it("optional trailing settings may be left out (older strategies, code like rsi(14))", () => {
    expect(() => validateConditionNode({ kind: "comparison", left: { kind: "indicator", type: "RSI", params: [14] }, operator: "LT", right: { kind: "constant", value: 30 } })).not.toThrow();
    expect(() => validateConditionNode({ kind: "comparison", left: { kind: "indicator", type: "RSI", params: [14, 2, 1] }, operator: "LT", right: { kind: "constant", value: 30 } })).not.toThrow();
    expect(() => validateConditionNode({ kind: "comparison", left: { kind: "indicator", type: "RSI", params: [14, 9, 0] }, operator: "LT", right: { kind: "constant", value: 30 } })).toThrow(/Source must be one of/);
    expect(() => validateConditionNode({ kind: "comparison", left: { kind: "indicator", type: "RSI", params: [] }, operator: "LT", right: { kind: "constant", value: 30 } })).toThrow();
  });
  it("code accepts rsi(14) and rsi(14, 1, 2)", () => {
    expect(parseDsl("rsi(14) < 30")).toMatchObject({ left: { type: "RSI", params: [14] } });
    expect(parseDsl("rsi(14, 1, 2) > 70")).toMatchObject({ left: { type: "RSI", params: [14, 1, 2] } });
    expect(() => parseDsl("rsi() > 70")).toThrow();
  });
  it("computeIndicatorSeries fills missing optional settings", () => {
    const data = closes(Array.from({ length: 40 }, (_, i) => 100 + Math.sin(i / 3) * 5));
    expect(computeIndicatorSeries(data, "RSI", [14])).toEqual(computeIndicatorSeries(data, "RSI", [14, 0, 0]));
    expect(computeIndicatorSeries(data, "MACD_LINE", [12, 26, 9]).length).toBeGreaterThan(0);
  });
});
