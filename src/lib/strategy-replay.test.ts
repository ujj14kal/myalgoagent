import { describe, expect, it } from "vitest";
import type { Candle } from "@/lib/market-data";
import { tradeLevels } from "./strategy-replay";
import { buildScenarios } from "./strategy-replay-scenarios";
import type { StrategyPreview } from "./strategy-preview";

const bar = (i: number, o: number, h: number, l: number, c: number): Candle => ({ time: 1_700_000_000 + i * 86_400, open: o, high: h, low: l, close: c, volume: 1000 });
const flat = (n: number, p = 100) => Array.from({ length: n }, (_, i) => bar(i, p, p + 1, p - 1, p));
const pct = (v: number) => ({ enabled: true, unit: "PERCENT" as const, value: v });

describe("tradeLevels", () => {
  it("places a long's stop below and target above, and ratchets the trailing stop up with new highs", () => {
    const candles = [...flat(3), bar(3, 100, 104, 99, 103), bar(4, 103, 108, 102, 107), bar(5, 107, 107, 101, 102)];
    const lv = tradeLevels(candles, 3, 5, 100, { stopLoss: pct(2), target: pct(10), trailingSl: pct(3) }, "LONG", () => undefined);
    expect(lv.stopLoss).toBe(98);
    expect(lv.target).toBe(110);
    // extreme = 104, then 108, then still 108; trail = extreme − 3
    expect(lv.trailing).toEqual([101, 105, 105]);
  });

  it("mirrors everything for a short", () => {
    const candles = [...flat(3), bar(3, 100, 101, 96, 97), bar(4, 97, 98, 93, 94)];
    const lv = tradeLevels(candles, 3, 4, 100, { stopLoss: pct(2), target: pct(5), trailingSl: pct(3) }, "SHORT", () => undefined);
    expect(lv.stopLoss).toBe(102);
    expect(lv.target).toBe(95);
    expect(lv.trailing).toEqual([99, 96]);
  });
});

function preview(over: Partial<StrategyPreview>): StrategyPreview {
  return {
    symbol: "TEST.NS", candles: flat(60), trades: [], entryRule: "x", exitRule: null, totalReturnPct: 0, winRatePct: 0, capital: 100000,
    dataSource: "test", timeframeLabel: "1D", periodLabel: "6 months", intraday: false, entryOrderLabel: "market orders", direction: "LONG", entryJoin: "SINGLE",
    studies: { overlays: [], priceLevels: [], oscillators: [], volume: { show: false, lines: [] }, markers: [], timeWindows: [], notes: [] },
    risk: { stopLoss: { unit: "PERCENT", value: 3 }, target: { unit: "PERCENT", value: 6 }, trailing: null },
    ...over,
  };
}

const trade = (exitReason: "target" | "stop_loss" | "exit_rule", entryIdx = 40, exitIdx = 45) => ({
  entryTime: 1_700_000_000 + entryIdx * 86_400, entryPrice: 100, exitTime: 1_700_000_000 + exitIdx * 86_400, exitPrice: exitReason === "target" ? 106 : 97,
  quantity: 10, netPnl: 0, netPnlPct: exitReason === "target" ? 6 : -3, exitReason, entryReason: "rule",
  replay: { signalIdx: entryIdx - 1, entryIdx, exitIdx, stopLoss: 97, target: 106, trailing: null, checks: [{ text: "rule", ok: true }] },
});

describe("buildScenarios", () => {
  it("uses real trades where they exist and illustrates the configured outcomes that never happened", () => {
    const s = buildScenarios(preview({ trades: [trade("exit_rule")] }));
    const byShows = Object.fromEntries(s.map((x) => [x.shows, x]));
    expect(byShows.exit_rule.illustration).toBe(false);
    expect(byShows.target.illustration).toBe(true);
    expect(byShows.stop_loss.illustration).toBe(true);
    // Illustrations end the way they're labelled when nothing else can fire first.
    expect(byShows.target.kind).toBe("target");
    expect(byShows.stop_loss.kind).toBe("stop_loss");
    expect(byShows.target.exitPrice).toBe(106);
    expect(byShows.stop_loss.exitPrice).toBe(97);
    // The real chart is kept up to the entry; only the part after it is made up.
    expect(byShows.target.syntheticFrom).toBe(byShows.target.entryIdx);
    expect(byShows.target.sourceIdx[byShows.target.signalIdx]).toBe(39);
  });

  it("never invents a scenario for a leg the user didn't set", () => {
    const s = buildScenarios(preview({ trades: [trade("exit_rule")], risk: { stopLoss: null, target: null, trailing: null } }));
    expect(s.map((x) => x.shows)).toEqual(["exit_rule"]);
  });

  it("says so when a tighter trailing stop always beats the stop-loss", () => {
    const s = buildScenarios(preview({ trades: [trade("target")], risk: { stopLoss: { unit: "PERCENT", value: 5 }, target: { unit: "PERCENT", value: 6 }, trailing: { unit: "PERCENT", value: 2 } } }));
    const sl = s.find((x) => x.shows === "stop_loss")!;
    expect(sl.kind).toBe("trailing_stop");
    expect(sl.note).toMatch(/trailing stop is tighter/);
  });

  it("demo mode shows a clean demo move after the entry even for outcomes that really happened, and keeps exit rules real", () => {
    const s = buildScenarios(preview({ trades: [trade("target"), trade("stop_loss", 50, 55), trade("exit_rule", 60, 62)] }), "demo");
    const byShows = Object.fromEntries(s.map((x) => [x.shows, x]));
    expect(byShows.target.illustration).toBe(true);
    expect(byShows.target.alsoReal).toBe(true);
    expect(byShows.target.kind).toBe("target");
    expect(byShows.stop_loss.illustration).toBe(true);
    expect(byShows.stop_loss.alsoReal).toBe(true);
    // The entry comes from the real trade with that outcome.
    expect(byShows.stop_loss.sourceIdx[byShows.stop_loss.signalIdx]).toBe(49);
    expect(byShows.exit_rule.illustration).toBe(false);
    // Real mode keeps the actual trades.
    const real = buildScenarios(preview({ trades: [trade("target")] }), "real");
    expect(real.find((x) => x.shows === "target")!.illustration).toBe(false);
  });

  it("shows nothing when the rule never triggered", () => {
    expect(buildScenarios(preview({}))).toEqual([]);
  });
});
