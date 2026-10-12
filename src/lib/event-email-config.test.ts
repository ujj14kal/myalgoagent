import { describe, expect, it } from "vitest";
import { cleanPrefs, creditWarning, wantsEmail } from "./event-email-config";

describe("event email rules", () => {
  it("sends by default and respects a switch-off", () => {
    expect(wantsEmail(null, "live_order")).toBe(true);
    expect(wantsEmail({ live_order: false }, "live_order")).toBe(false);
    expect(wantsEmail({ live_order: true }, "live_order")).toBe(true);
  });
  it("never lets safety alerts be switched off", () => {
    expect(wantsEmail({ live_paused: false, broker_session: false }, "live_paused")).toBe(true);
    expect(wantsEmail({ broker_session: false }, "broker_session")).toBe(true);
    expect(cleanPrefs({ live_paused: false, live_order: false, junk: false })).toEqual({ live_order: false });
  });
  it("warns once as credits cross the thresholds", () => {
    expect(creditWarning(1500, 1490, 1500)).toBeNull();
    expect(creditWarning(160, 148, 1500)).toBe("credits_low"); // 10% of 1500 = 150
    expect(creditWarning(148, 140, 1500)).toBeNull();
    expect(creditWarning(3, 0, 1500)).toBe("credits_out");
    expect(creditWarning(0, 0, 1500)).toBeNull();
    expect(creditWarning(25, 15, 20)).toBeNull(); // free plan: threshold is the 10-credit floor
    expect(creditWarning(12, 9, 20)).toBe("credits_low");
  });
});
