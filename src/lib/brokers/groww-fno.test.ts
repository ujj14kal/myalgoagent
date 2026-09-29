import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { optionKey, parseGrowwOptions } from "./groww-fno";

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
