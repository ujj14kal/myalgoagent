import { describe, expect, it } from "vitest";
import type { Candle } from "@/lib/market-data";
import { computeIndicatorSeries } from "./compute-series";
import { INDICATOR_CATALOG } from "./indicator-catalog";

// The chart runs every indicator the user adds with whatever settings they
// type, on whatever data the range/interval returns. None may ever throw —
// a throw here crashes the whole instrument page (seen live on SUNPHARMA.NS).
const candles = (n: number): Candle[] =>
  Array.from({ length: n }, (_, i) => ({ time: 1_700_000_000 + i * 300, open: 100 + Math.sin(i), high: 102 + Math.sin(i), low: 98 + Math.sin(i), close: 100 + Math.cos(i), volume: 1000 + i }));

describe("computeIndicatorSeries never throws", () => {
  for (const def of INDICATOR_CATALOG) {
    const paramSets = [def.defaults, def.defaults.map(() => 1), def.defaults.map(() => 0), def.defaults.map(() => 500), []];
    for (const n of [0, 1, 2, 5, 40]) {
      it(`${def.kind} on ${n} candles`, () => {
        for (const params of paramSets) expect(() => computeIndicatorSeries(candles(n), def.kind, params), `params ${JSON.stringify(params)}`).not.toThrow();
      });
    }
  }
});
