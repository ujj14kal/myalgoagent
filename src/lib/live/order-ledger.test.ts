import { describe, expect, it } from "vitest";
import { istDay, orderLedgerInfo } from "./order-ledger";

describe("orderLedgerInfo", () => {
  it("reads a strategy entry", () => {
    expect(orderLedgerInfo({ purpose: "strategy", reason: "Strategy “NEW 1”: entry rule", side: "BUY" })).toEqual({ kind: "Entry", strategy: "NEW 1", why: "Entry rule" });
  });
  it("says why an exit happened", () => {
    expect(orderLedgerInfo({ purpose: "exit", reason: "Strategy “NEW 1”: stop-loss", side: "SELL" })).toEqual({ kind: "Exit", strategy: "NEW 1", why: "Closed because of stop-loss" });
    expect(orderLedgerInfo({ purpose: "exit", reason: "Strategy “NEW 1”: intraday square-off", side: "SELL" }).why).toBe("Closed because of intraday square-off");
    expect(orderLedgerInfo({ purpose: "exit", reason: "Strategy “NEW 1”: Target 2", side: "SELL" }).why).toBe("Closed because of Target 2");
  });
  it("shows an exit you triggered yourself", () => {
    expect(orderLedgerInfo({ purpose: "exit", reason: "Strategy “NEW 1”: closed by you", side: "SELL" }).why).toBe("You closed it from Live Trading");
  });
  it("treats an exit-looking reason on a strategy order as an exit", () => {
    expect(orderLedgerInfo({ purpose: "strategy", reason: "Strategy “A”: exit rule", side: "SELL" }).kind).toBe("Exit");
  });
  it("handles manual and test orders with no reason", () => {
    expect(orderLedgerInfo({ purpose: "manual", reason: null, side: "BUY" })).toEqual({ kind: "Manual", strategy: null, why: "Placed by you" });
    expect(orderLedgerInfo({ purpose: "test", reason: null, side: "BUY" }).why).toBe("Connection check");
  });
});

describe("istDay", () => {
  it("uses the Indian calendar day", () => {
    expect(istDay(new Date("2026-10-06T19:00:00Z"))).toBe("2026-10-07");
  });
});
