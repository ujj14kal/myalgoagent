import { describe, expect, it } from "vitest";
import { parseDataset, parseTime } from "./dataset";

describe("parseTime", () => {
  it("reads dates as Indian time, counting from 18:00 after the close when only a date is given", () => {
    expect(parseTime("2026-03-10")).toBe(Date.parse("2026-03-10T12:30:00Z") / 1000); // 18:00 IST
    expect(parseTime("10/03/2026")).toBe(parseTime("2026-03-10"));
    expect(parseTime("10-03-2026")).toBe(parseTime("2026-03-10"));
  });
  it("uses an explicit time as given", () => {
    expect(parseTime("2026-03-10 09:15")).toBe(Date.parse("2026-03-10T03:45:00Z") / 1000);
    expect(parseTime("2026-03-10T15:30:30")).toBe(Date.parse("2026-03-10T10:00:30Z") / 1000);
  });
  it("accepts seconds and milliseconds since 1970, and refuses nonsense", () => {
    expect(parseTime("1773144900")).toBe(1773144900);
    expect(parseTime("1773144900000")).toBe(1773144900);
    expect(parseTime("hello")).toBeNull();
    expect(parseTime("2026-13-40")).toBeNull();
  });
});

describe("parseDataset", () => {
  it("reads rows in any order, skips a header and bad lines, keeps the last of a repeated time", () => {
    const d = parseDataset("date,score\n2026-03-12,3\n2026-03-10,1\nbad line\n2026-03-11,2\n2026-03-11,2.5");
    expect(d.values).toEqual([1, 2.5, 3]);
    expect(d.times).toEqual([...d.times].sort((a, b) => a - b));
    expect(d.skipped).toBe(1);
  });
  it("understands tabs and semicolons", () => {
    expect(parseDataset("2026-03-10\t1\n2026-03-11\t2").values).toEqual([1, 2]);
    expect(parseDataset("2026-03-10;1\n2026-03-11;2").values).toEqual([1, 2]);
  });
  it("explains what is wrong", () => {
    expect(() => parseDataset("")).toThrow(/Paste your table/);
    expect(() => parseDataset("a,b\nc,d")).toThrow(/No usable rows/);
    expect(() => parseDataset("2026-03-10,1")).toThrow(/at least 2 rows/);
    const big = Array.from({ length: 1600 }, (_, i) => `${i + 1000000000},${i}`).join("\n");
    expect(() => parseDataset(big)).toThrow(/Keep the most recent/);
  });
});
