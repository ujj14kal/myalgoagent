import { describe, expect, it } from "vitest";
import { checkNewAlert, describeAlert, isTriggered } from "./price-alerts";

describe("price alerts", () => {
  it("fires at or past the level on the right side only", () => {
    expect(isTriggered("ABOVE", 100, 100)).toBe(true);
    expect(isTriggered("ABOVE", 100, 99.99)).toBe(false);
    expect(isTriggered("BELOW", 100, 100)).toBe(true);
    expect(isTriggered("BELOW", 100, 100.01)).toBe(false);
    expect(isTriggered("ABOVE", 100, NaN)).toBe(false);
  });
  it("refuses an alert that would fire at once", () => {
    expect(checkNewAlert("ABOVE", 90, 100)).toMatch(/already at or above/);
    expect(checkNewAlert("BELOW", 110, 100)).toMatch(/already at or below/);
    expect(checkNewAlert("ABOVE", 110, 100)).toBeNull();
    expect(checkNewAlert("ABOVE", 110, null)).toBeNull();
    expect(checkNewAlert("ABOVE", -1, null)).toMatch(/above 0/);
  });
  it("describes an alert in words", () => {
    expect(describeAlert({ symbol: "RELIANCE.NS", direction: "ABOVE", price: 3000 })).toBe("RELIANCE goes to or above ₹3,000");
  });
});
