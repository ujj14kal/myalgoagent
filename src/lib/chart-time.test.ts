import { describe, expect, it } from "vitest";
import type { Time } from "lightweight-charts";
import { istCrosshairTime, istTickMark } from "./chart-time";

// 2026-10-05 09:15 IST = 03:45 UTC
const OPEN = Date.UTC(2026, 9, 5, 3, 45) / 1000;
// A daily bar stamped at IST midnight is 18:30 UTC the day before.
const IST_MIDNIGHT = Date.UTC(2026, 9, 4, 18, 30) / 1000;

describe("chart time is IST", () => {
  it("shows the NSE open as 09:15, not 03:45", () => {
    expect(istCrosshairTime(OPEN as Time)).toBe("5 Oct 26 09:15");
    expect(istTickMark(OPEN as Time, 3)).toBe("09:15");
  });
  it("shows a daily bar on its own date, not the day before", () => {
    expect(istCrosshairTime(IST_MIDNIGHT as Time)).toBe("5 Oct 26");
    expect(istTickMark(IST_MIDNIGHT as Time, 2)).toBe("5 Oct");
  });
  it("labels months and years in IST", () => {
    expect(istTickMark(IST_MIDNIGHT as Time, 1)).toBe("Oct");
    expect(istTickMark(IST_MIDNIGHT as Time, 0)).toBe("2026");
  });
});
