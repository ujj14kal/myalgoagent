import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseUniverseCsv } from "./universe";

describe("parseUniverseCsv", () => {
  const csv = readFileSync(join(__dirname, "../brokers/__fixtures__/nse-eq-sample.csv"), "utf8");
  it("keeps EQ-series equities with display names, Yahoo-style symbols", () => {
    const rows = parseUniverseCsv(csv);
    expect(rows.find((r) => r.symbol === "TCS.NS")).toEqual({ symbol: "TCS.NS", name: "Tata Consultancy Services", exchange: "NSE" });
    expect(rows.some((r) => r.symbol === "GOLDSTAR.NS")).toBe(false); // SME series
    expect(new Set(rows.map((r) => r.symbol)).size).toBe(rows.length);
  });
});
