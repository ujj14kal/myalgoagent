import { describe, expect, it } from "vitest";
import { strategyFromLegs } from "./strategy-from-legs";
import type { OptionLeg } from "@/lib/options/positions";

const leg = (type: "CE" | "PE", side: "BUY" | "SELL", strike: number, lots = 1): OptionLeg => ({ kind: "OPTION", type, side, strike, premium: 100, lots, lotSize: 75, expiryDays: 3, iv: 0.13 });
const base = { underlying: "nifty", step: 50, atm: 25000, expiries: ["2026-10-13", "2026-10-20", "2026-10-27"], expiry: "2026-10-13" };

describe("options strategy from the contracts picked in the Lab", () => {
  it("keeps each leg's side, type and lots and turns the strike into strikes-from-ATM", () => {
    const { input, notes } = strategyFromLegs({ ...base, legs: [leg("CE", "SELL", 25100, 2), leg("PE", "SELL", 24900, 2), leg("CE", "BUY", 25300), leg("PE", "BUY", 24700)] });
    expect(input.legs).toEqual([
      { type: "CE", side: "SELL", offset: 2, lots: 2 },
      { type: "PE", side: "SELL", offset: -2, lots: 2 },
      { type: "CE", side: "BUY", offset: 6, lots: 1 },
      { type: "PE", side: "BUY", offset: -6, lots: 1 },
    ]);
    expect(input.underlying).toBe("NIFTY");
    expect(notes).toEqual([]);
  });
  it("maps the chosen expiry to the nearest-expiry rule, the next, or the month's last", () => {
    expect(strategyFromLegs({ ...base, legs: [leg("CE", "BUY", 25000)] }).input.expiryRule).toBe("WEEKLY_CURRENT");
    expect(strategyFromLegs({ ...base, expiry: "2026-10-20", legs: [leg("CE", "BUY", 25000)] }).input.expiryRule).toBe("WEEKLY_NEXT");
    expect(strategyFromLegs({ ...base, expiry: "2026-10-27", legs: [leg("CE", "BUY", 25000)] }).input.expiryRule).toBe("MONTHLY");
  });
  it("says what it could not carry over exactly", () => {
    const far = strategyFromLegs({ ...base, legs: [leg("CE", "BUY", 26000), leg("PE", "BUY", 24925)] });
    expect(far.input.legs.map((l) => l.offset)).toEqual([10, -1]);
    expect(far.tooFar).toEqual([26000].filter((k) => Math.round((k - 25000) / 50) > 10)); // 20 strikes away: can't be kept as a strategy
    expect(strategyFromLegs({ ...base, legs: [leg("CE", "BUY", 25500)] }).tooFar).toEqual([]);
    expect(far.notes.join(" ")).toMatch(/isn't on the 50-point strike grid/);
    expect(strategyFromLegs({ ...base, legs: Array.from({ length: 8 }, () => leg("CE", "BUY", 25000)) }).input.legs).toHaveLength(6);
  });
});
