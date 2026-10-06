import { describe, expect, it } from "vitest";
import { legPrice } from "./risk-management-fields";

describe("legPrice — the price a risk leg works out to", () => {
  it("puts a points target N points above a long entry and below a short one", () => {
    expect(legPrice("target", { unit: "POINTS", value: 100 }, 1000, "LONG")).toBe(1100);
    expect(legPrice("target", { unit: "POINTS", value: 100 }, 1000, "SHORT")).toBe(900);
  });
  it("puts stops against the trade", () => {
    expect(legPrice("stop", { unit: "POINTS", value: 25 }, 1000, "LONG")).toBe(975);
    expect(legPrice("stop", { unit: "PERCENT", value: 2 }, 1000, "SHORT")).toBe(1020);
  });
  it("handles percent targets", () => {
    expect(legPrice("target", { unit: "PERCENT", value: 6 }, 1431.52, "LONG")).toBe(1517.41);
  });
  it("gives no price when it can't be known or makes no sense", () => {
    expect(legPrice("target", { unit: "ATR_MULTIPLE", value: 2 }, 1000, "LONG")).toBeNull();
    expect(legPrice("target", { unit: "POINTS", value: 1200 }, 1000, "SHORT")).toBeNull();
    expect(legPrice("target", { unit: "POINTS", value: 0 }, 1000, "LONG")).toBeNull();
  });
});
