import { describe, expect, it } from "vitest";
import { inMarketWindow } from "./market-window";

// IST = UTC+5:30
const ist = (iso: string) => new Date(`${iso}+05:30`);

describe("inMarketWindow", () => {
  it("is open during the weekday session", () => {
    expect(inMarketWindow(ist("2026-09-28T09:15:00"))).toBe(true); // Monday open
    expect(inMarketWindow(ist("2026-09-28T12:00:00"))).toBe(true);
    expect(inMarketWindow(ist("2026-09-28T15:45:00"))).toBe(true); // grace for the last candle
  });
  it("is closed before the open and after the grace period", () => {
    expect(inMarketWindow(ist("2026-09-28T09:14:00"))).toBe(false);
    expect(inMarketWindow(ist("2026-09-28T15:46:00"))).toBe(false);
  });
  it("is closed on weekends, even at noon IST", () => {
    expect(inMarketWindow(ist("2026-09-26T12:00:00"))).toBe(false); // Saturday
    expect(inMarketWindow(ist("2026-09-27T12:00:00"))).toBe(false); // Sunday
  });
});
