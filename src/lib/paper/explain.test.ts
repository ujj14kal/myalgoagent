import { describe, expect, it } from "vitest";
import { explainPaperOrder, type ExplainContext } from "./explain";

const ctx: ExplainContext = {
  symbol: "RELIANCE.NS",
  strategyName: "RSI dip",
  direction: "LONG",
  entryRule: "rsi(14) < 30",
  exitRule: "rsi(14) > 70",
  stopLoss: { unit: "PERCENT", value: 3 },
  target: { unit: "PERCENT", value: 6 },
  trailingStop: { unit: "ATR_MULTIPLE", value: 2 },
};
// 22 Sep 2026, 10:00 UTC
const T = Date.UTC(2026, 8, 22, 10) / 1000;
const order = (over: Partial<Parameters<typeof explainPaperOrder>[0]>) => ({
  side: "BUY" as const, time: T, price: 2997.1, quantity: 33, fees: 0, netPnl: null, reason: "entry_rule" as const, signalTime: T, ...over,
});

describe("explainPaperOrder", () => {
  it("explains an entry with the rule and the signal date", () => {
    const s = explainPaperOrder(order({}), ctx);
    expect(s).toContain("Bought 33 RELIANCE.NS at ₹2,997.1 (RSI dip)");
    expect(s).toContain("entry rule (rsi(14) < 30) was true at the close on 22 Sept");
  });

  it("names the risk rule that closed a position and the P&L", () => {
    expect(explainPaperOrder(order({ side: "SELL", reason: "stop_loss", netPnl: -4128.5 }), ctx)).toMatch(/3% stop-loss was hit.*P&L −₹4,128.5/);
    expect(explainPaperOrder(order({ side: "SELL", reason: "target", netPnl: 900 }), ctx)).toMatch(/6% take-profit was reached.*P&L \+₹900/);
    expect(explainPaperOrder(order({ side: "SELL", reason: "trailing_stop", netPnl: 10 }), ctx)).toContain("2× ATR trailing stop");
    expect(explainPaperOrder(order({ side: "SELL", reason: "exit_rule", netPnl: 1 }), ctx)).toContain("exit rule (rsi(14) > 70) became true");
  });

  it("uses short-selling words for short strategies", () => {
    const shortCtx = { ...ctx, direction: "SHORT" as const };
    expect(explainPaperOrder(order({ side: "SELL" }), shortCtx)).toMatch(/^Sold short/);
    expect(explainPaperOrder(order({ side: "BUY", reason: "stop_loss", netPnl: -1 }), shortCtx)).toMatch(/^Bought back/);
  });
});
