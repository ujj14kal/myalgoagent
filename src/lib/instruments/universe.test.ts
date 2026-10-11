import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseBseUniverseCsv, parseUniverseCsv } from "./universe";

describe("parseUniverseCsv", () => {
  const csv = readFileSync(join(__dirname, "../brokers/__fixtures__/nse-eq-sample.csv"), "utf8");
  it("keeps EQ-series equities with display names, Yahoo-style symbols", () => {
    const rows = parseUniverseCsv(csv);
    expect(rows.find((r) => r.symbol === "TCS.NS")).toEqual({ symbol: "TCS.NS", name: "Tata Consultancy Services", exchange: "NSE" });
    expect(rows.some((r) => r.symbol === "GOLDSTAR.NS")).toBe(false); // SME series
    expect(new Set(rows.map((r) => r.symbol)).size).toBe(rows.length);
  });
});


describe("parseBseUniverseCsv", () => {
  const head = "EXCH_ID,SEGMENT,SECURITY_ID,ISIN,INSTRUMENT,UNDERLYING_SECURITY_ID,UNDERLYING_SYMBOL,SYMBOL_NAME,DISPLAY_NAME,INSTRUMENT_TYPE,SERIES,LOT_SIZE";
  const csv = [
    head,
    "BSE,E,500325,INE002A01018,EQUITY,,RELIANCE,RELIANCE INDUSTRIES LTD,Reliance Industries,ES,A,1.0",
    "BSE,E,532540,INE467B01029,EQUITY,,TCS,TATA CONSULTANCY SERVICES,Tata Consultancy,ES,A,1.0",
    "BSE,E,543000,INE000000001,EQUITY,,SMALLCO,SMALL CO LTD,Small Co,ES,B,1.0",
    "BSE,E,100000,INE000000002,EQUITY,,THINLY,THINLY TRADED,Thinly,ES,F,1.0",
    "BSE,E,100001,INE000000003,EQUITY,,TNS,TRADE FOR TRADE,Tns,ES,T,1.0",
    "BSE,I,1,,INDEX,,SENSEX,SENSEX,Sensex,INDEX,NA,1.0",
    "BSE,E,100002,INE000000004,EQUITY,,BAD$,BAD SYMBOL,Bad,ES,A,1.0",
  ].join("\n");
  it("keeps groups A and B equities as .BO symbols on the BSE", () => {
    expect(parseBseUniverseCsv(csv)).toEqual([
      { symbol: "RELIANCE.BO", name: "Reliance Industries", exchange: "BSE" },
      { symbol: "SMALLCO.BO", name: "Small Co", exchange: "BSE" },
      { symbol: "TCS.BO", name: "Tata Consultancy", exchange: "BSE" },
    ]);
  });
  it("refuses a file in an unexpected shape", () => {
    expect(() => parseBseUniverseCsv("A,B\n1,2")).toThrow(/unexpected columns/);
  });
});
