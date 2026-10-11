import { describe, expect, it } from "vitest";
import type { OptionStrategyInput } from "@/lib/option-strategy-actions";
import { matchTemplate, readStrategy } from "./describe-strategy";
import { strategyFromQuery, strategyToQuery } from "./strategy-from-legs";

const base: OptionStrategyInput = { name: "t", underlying: "NIFTY", legs: [{ type: "CE", side: "SELL", offset: 0, lots: 1 }, { type: "PE", side: "SELL", offset: 0, lots: 1 }], expiryRule: "WEEKLY_CURRENT", entryMinute: 560, exitMinute: 915, weekdays: [1, 2, 3, 4, 5], stopLossUnit: null, stopLossValue: null, targetUnit: null, targetValue: null };

describe("readStrategy", () => {
  it("names a classic strategy and says its risk", () => {
    const r = readStrategy(base);
    expect(r.title).toBe("Short Straddle");
    expect(r.shape.loss).toBe("unlimited");
    expect(r.shape.profit).toBe("limited");
    expect(r.warnings.join(" ")).toMatch(/no stop-loss/);
  });
  it("sees limited risk in an iron condor and stays quiet about it", () => {
    const ic = { ...base, legs: [{ type: "PE", side: "BUY", offset: -4, lots: 1 }, { type: "PE", side: "SELL", offset: -2, lots: 1 }, { type: "CE", side: "SELL", offset: 2, lots: 1 }, { type: "CE", side: "BUY", offset: 4, lots: 1 }] } as OptionStrategyInput;
    const r = readStrategy(ic);
    expect(r.title).toBe("Iron Condor");
    expect(r.shape).toMatchObject({ loss: "limited", profit: "limited" });
    expect(r.warnings).toEqual([]);
  });
  it("calls an unknown combination custom and describes when it trades", () => {
    const r = readStrategy({ ...base, legs: [{ type: "CE", side: "BUY", offset: 3, lots: 2 }], weekdays: [1, 3], stopLossUnit: "RUPEES", stopLossValue: 2000 });
    expect(r.title).toBe("Custom strategy");
    expect(r.when).toMatch(/Mon, Wed/);
    expect(r.when).toMatch(/Stop-loss ₹2000/);
    expect(r.legs[0]).toMatch(/Buy 2 lots/);
  });
  it("matches templates whatever the lots", () => {
    expect(matchTemplate([{ type: "CE", side: "BUY", offset: 0, lots: 5 }])?.label).toBe("Long Call");
  });
});

describe("a strategy in a link", () => {
  it("round-trips", () => {
    const s: OptionStrategyInput = { ...base, name: "My condor", weekdays: [2, 4], stopLossUnit: "PREMIUM_PCT", stopLossValue: 40, targetUnit: "RUPEES", targetValue: 1500, expiryRule: "MONTHLY" };
    const q = Object.fromEntries(new URLSearchParams(strategyToQuery(s)));
    expect(strategyFromQuery(q, base)).toEqual(s);
  });
  it("keeps the defaults for anything malformed", () => {
    expect(strategyFromQuery({ legs: "XX.BUY.1.1", exp: "NEVER", in: "abc", days: "9" }, base)).toEqual(base);
  });
});
