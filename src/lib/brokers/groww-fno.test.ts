import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contractsFrom, optionKey, parseGrowwOptions, underlyingsFrom } from "./groww-fno";

describe("parseGrowwOptions", () => {
  const csv = readFileSync(join(__dirname, "__fixtures__/groww-fno-sample.csv"), "utf8");
  const map = parseGrowwOptions(csv, "NIFTY");
  it("finds weekly and monthly contracts by underlying, expiry, strike and type", () => {
    expect(map.get(optionKey("NIFTY", "2026-10-06", 22700, "CE"))).toMatchObject({ tradingSymbol: "NIFTY26O0622700CE", lotSize: 65, tick: 0.05, freezeQty: 1801 });
    expect(map.get(optionKey("NIFTY", "2026-11-23", 22700, "CE"))?.tradingSymbol).toBe("NIFTY26NOV22700CE");
  });
  it("ignores other underlyings and the cash segment", () => {
    expect([...map.values()].every((o) => o.tradingSymbol.startsWith("NIFTY2"))).toBe(true);
    expect(map.get(optionKey("NIFTY", "2026-10-06", 99999, "CE"))).toBeUndefined();
  });
});

describe("option contracts from the instrument list", () => {
  const csv = readFileSync(join(__dirname, "__fixtures__/groww-fno-sample.csv"), "utf8");
  it("lists expiries soonest first, strikes per expiry and the lot size", () => {
    const c = contractsFrom(parseGrowwOptions(csv, "NIFTY"));
    expect(c.expiries[0]).toBe("2026-10-06");
    expect(c.expiries).toEqual([...c.expiries].sort());
    expect(c.lotSize).toBe(65);
    expect(c.strikes["2026-10-06"]).toContain(22700);
    expect(c.strikes["2026-10-06"]).toEqual([...c.strikes["2026-10-06"]].sort((a, b) => a - b));
  });
  it("lists underlyings with indices first", () => {
    const u = underlyingsFrom(csv);
    expect(u[0]).toBe("NIFTY");
    expect(new Set(u).size).toBe(u.length);
  });
});
