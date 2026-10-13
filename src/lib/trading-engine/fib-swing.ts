import type { Candle } from "@/lib/market-data";
import { fibonacciLevels } from "@/lib/indicators-study";
import type { RiskManagementConfig } from "./step";

/** The Fibonacci swing in force at each candle, only built when a staged target is a Fibonacci extension. */
export function fibSwingLookup(candles: Candle[], rm: RiskManagementConfig | undefined): ((entryIdx: number) => { start: number; end: number } | undefined) | undefined {
  if (!(rm?.targets ?? []).some((t) => t.fibExtension !== undefined)) return undefined;
  const f = fibonacciLevels(candles, 5, 5, 3);
  const start = new Map(f.swingStart.map((p) => [p.time, p.value]));
  const end = new Map(f.swingEnd.map((p) => [p.time, p.value]));
  return (idx) => {
    const t = candles[idx]?.time;
    const a = t === undefined ? undefined : start.get(t);
    const b = t === undefined ? undefined : end.get(t);
    return a === undefined || b === undefined ? undefined : { start: a, end: b };
  };
}
