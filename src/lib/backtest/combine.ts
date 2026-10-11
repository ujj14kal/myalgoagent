// Several strategies backtested together: each keeps its own capital and its own run; the combined view adds
// their account values up over time. A strategy that hasn't traded yet counts at its starting capital, and one that
// has finished stays at its last value.

import type { EquityLite } from "./analytics";

export type CombinableRun = { id: string; name: string; symbol: string; startingCapital: number; equity: EquityLite[] };

export function combineEquity(runs: CombinableRun[]): EquityLite[] {
  const times = [...new Set(runs.flatMap((r) => r.equity.map((p) => p.time)))].filter(Number.isFinite).sort((a, b) => a - b);
  const sorted = runs.map((r) => ({ cap: r.startingCapital, pts: [...r.equity].filter((p) => Number.isFinite(p.equity)).sort((a, b) => a.time - b.time) }));
  const cursor = sorted.map(() => 0);
  const value = sorted.map((r) => r.cap);
  return times.map((time) => {
    let sum = 0;
    sorted.forEach((r, i) => {
      while (cursor[i] < r.pts.length && r.pts[cursor[i]].time <= time) value[i] = r.pts[cursor[i]++].equity;
      sum += value[i];
    });
    return { time, equity: Math.round(sum * 100) / 100 };
  });
}

export type CombinedSummary = {
  startingCapital: number;
  endingCapital: number;
  totalReturnPct: number;
  netPnl: number;
  trades: number;
  maxDrawdownPct: number;
  /** Each strategy's share of the combined profit or loss. */
  parts: { id: string; name: string; symbol: string; netPnl: number; returnPct: number; trades: number }[];
};

export function combinedSummary(runs: (CombinableRun & { trades: { netPnl: number }[] })[], curve: EquityLite[]): CombinedSummary {
  const startingCapital = runs.reduce((s, r) => s + r.startingCapital, 0);
  const endingCapital = curve.length ? curve[curve.length - 1].equity : startingCapital;
  let peak = -Infinity;
  let dd = 0;
  for (const p of curve) {
    peak = Math.max(peak, p.equity);
    if (peak > 0) dd = Math.max(dd, ((peak - p.equity) / peak) * 100);
  }
  return {
    startingCapital,
    endingCapital,
    totalReturnPct: startingCapital > 0 ? Math.round(((endingCapital - startingCapital) / startingCapital) * 10000) / 100 : 0,
    netPnl: Math.round((endingCapital - startingCapital) * 100) / 100,
    trades: runs.reduce((s, r) => s + r.trades.length, 0),
    maxDrawdownPct: Math.round(dd * 100) / 100,
    parts: runs.map((r) => {
      const netPnl = Math.round(r.trades.reduce((s, t) => s + t.netPnl, 0) * 100) / 100;
      return { id: r.id, name: r.name, symbol: r.symbol, netPnl, returnPct: r.startingCapital > 0 ? Math.round((netPnl / r.startingCapital) * 10000) / 100 : 0, trades: r.trades.length };
    }),
  };
}
