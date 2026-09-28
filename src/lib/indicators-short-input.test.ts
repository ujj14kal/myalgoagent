import { describe, expect, it } from "vitest";
import * as ind from "./indicators";
import type { Candle } from "@/lib/market-data";

// Every indicator must cope with fewer candles than its period (e.g. a
// 200-period average on a one-day intraday chart) — return nothing, never throw.
const candles = (n: number): Candle[] => Array.from({ length: n }, (_, i) => ({ time: 1_700_000_000 + i * 300, open: 100 + i, high: 101 + i, low: 99 + i, close: 100 + i, volume: 1000 }));

describe("indicators with too few candles", () => {
  const fns = Object.entries(ind).filter(([, v]) => typeof v === "function") as [string, (...a: unknown[]) => unknown][];
  for (const n of [0, 1, 3]) {
    for (const [name, fn] of fns) {
      it(`${name} on ${n} candles`, () => {
        expect(() => fn(candles(n), 200, 200, 200)).not.toThrow();
      });
    }
  }
});
