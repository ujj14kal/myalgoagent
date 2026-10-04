import { describe, expect, it } from "vitest";
import { explainLive, type LiveStatusInput } from "./explain-live";
import type { ConditionNode } from "@/lib/strategy/types";

const at = (hhmm: string, day = "2026-10-05") => new Date(`${day}T${hhmm}:00+05:30`); // a Monday
const win = (start: number, end: number): ConditionNode => ({ kind: "signal", signal: { family: "TIME_WINDOW", startMinute: start, endMinute: end } });
const base = (over: Partial<LiveStatusInput> = {}): LiveStatusInput => ({
  status: "ACTIVE",
  now: at("11:00"),
  startedAt: at("10:30"),
  lastCheckedAt: new Date(at("11:00").getTime() - 10_000),
  lastError: null,
  positionQty: 0,
  positionAvgPrice: null,
  direction: "SHORT",
  entryCondition: win(11 * 60 + 3, 11 * 60 + 4),
  exitCondition: win(11 * 60 + 30, 15 * 60 + 30),
  symbol: "TARIL.NS",
  lastOrder: null,
  ...over,
});

describe("explainLive", () => {
  it("says a stopped or paused strategy is not trading, with the reason", () => {
    expect(explainLive(base({ status: "STOPPED" })).headline).toBe("Stopped");
    const p = explainLive(base({ status: "PAUSED", lastError: "SELL 1 was not accepted: Margin Exceeds" }));
    expect(p.tone).toBe("warn");
    expect(p.detail).toContain("Margin Exceeds");
  });
  it("describes an open position and its exit rule", () => {
    const s = explainLive(base({ positionQty: 1, positionAvgPrice: 294.85 }));
    expect(s.headline).toBe("Holding 1 TARIL at ₹294.85");
    expect(s.detail).toContain("from 11:30 IST");
  });
  it("says the market is closed outside NSE hours and at weekends", () => {
    expect(explainLive(base({ now: at("08:00") })).headline).toBe("Market closed");
    expect(explainLive(base({ now: at("11:00", "2026-10-04") })).headline).toBe("Market closed"); // Sunday
  });
  it("warns when a live strategy has not been checked for minutes", () => {
    const s = explainLive(base({ lastCheckedAt: new Date(at("11:00").getTime() - 10 * 60_000) }));
    expect(s.tone).toBe("warn");
    expect(s.headline).toBe("Not being checked right now");
  });
  it("shows the reason an order was refused today", () => {
    const s = explainLive(base({ lastOrder: { side: "SELL", quantity: 1, status: "REJECTED", rejectReason: "RMS:Margin Exceeds", createdAt: at("10:59") } }));
    expect(s.tone).toBe("warn");
    expect(s.detail).toContain("RMS:Margin Exceeds");
  });
  it("counts down to a time-window entry, announces it, then explains a missed one", () => {
    expect(explainLive(base()).headline).toBe("Waiting for its entry time, 11:03 IST");
    expect(explainLive(base()).detail).toContain("SELL order for TARIL");
    expect(explainLive(base({ now: at("11:03"), lastCheckedAt: new Date(at("11:03").getTime() - 5_000) })).headline).toBe("Its entry time is now");
    const missed = explainLive(base({ now: at("11:20"), lastCheckedAt: new Date(at("11:20").getTime() - 5_000) }));
    expect(missed.headline).toContain("has passed without an order");
    expect(missed.detail).toContain("capital");
  });
  it("explains a strategy started after today's entry time", () => {
    const s = explainLive(base({ now: at("11:20"), startedAt: at("11:10"), lastCheckedAt: new Date(at("11:20").getTime() - 5_000) }));
    expect(s.detail).toContain("started after the entry window");
  });
  it("describes a rule-based entry in words", () => {
    const rule: ConditionNode = { kind: "signal", signal: { family: "CANDLE_PATTERN", pattern: "BULLISH_ENGULFING" } } as unknown as ConditionNode;
    const s = explainLive(base({ direction: "LONG", entryCondition: rule }));
    expect(s.headline).toBe("Watching TARIL");
    expect(s.detail).toContain("BUY order");
    expect(s.detail).toContain("closed candle");
  });
});
