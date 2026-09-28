import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { onTick, parseDhanNseCsv } from "./nse-master";

const csv = readFileSync(join(__dirname, "__fixtures__/nse-eq-sample.csv"), "utf8");

describe("NSE equity master", () => {
  const map = parseDhanNseCsv(csv);
  it("reads token, ISIN and tick (paise → rupees) for EQ stocks", () => {
    expect(map.RELIANCE).toEqual({ symbol: "RELIANCE", token: "2885", isin: "INE002A01018", tick: 0.1, series: "EQ" });
    expect(map.ITC.token).toBe("1660");
    expect(map.ITC.tick).toBe(0.05);
    expect(map["BAJAJ-AUTO"].tick).toBe(1);
    expect(map["M&M"].token).toBe("2031");
  });
  it("skips SME and other non-EQ series", () => {
    expect(map.GOLDSTAR).toBeUndefined();
  });
  it("refuses a file with unexpected columns", () => {
    expect(() => parseDhanNseCsv("A,B,C\n1,2,3")).toThrow();
  });
});

describe("tick rounding", () => {
  it("rounds onto the stock's tick", () => {
    expect(onTick(1234.567, 0.1, "down")).toBe(1234.5);
    expect(onTick(1234.51, 0.1, "up")).toBe(1234.6);
    expect(onTick(412.33, 0.05, "down")).toBe(412.3);
    expect(onTick(8123.7, 1, "down")).toBe(8123);
    expect(onTick(412.3, 0.05, "down")).toBe(412.3);
  });
});
