import { describe, expect, it } from "vitest";
import { cleanReason, creditsToTakeBack, refundAmountProblem, requestProblem, rupeesToPaise } from "./refund-rules";

const NOW = new Date("2026-10-13T10:00:00Z");
const pay = (o: Partial<Parameters<typeof requestProblem>[0]> = {}) => ({ status: "captured", createdAt: new Date("2026-10-10T10:00:00Z"), amount: 199_900, refundedAt: null, ...o });

describe("requestProblem", () => {
  it("lets a recent completed payment be asked about", () => expect(requestProblem(pay(), false, NOW)).toBeNull());
  it("refuses duplicates, refunded, failed and very old payments", () => {
    expect(requestProblem(pay(), true, NOW)).toMatch(/already have a refund request/);
    expect(requestProblem(pay({ refundedAt: NOW }), false, NOW)).toMatch(/already been refunded/);
    expect(requestProblem(pay({ status: "refunded" }), false, NOW)).toMatch(/already been refunded/);
    expect(requestProblem(pay({ status: "failed" }), false, NOW)).toMatch(/completed payment/);
    expect(requestProblem(pay({ createdAt: new Date("2026-03-01T00:00:00Z") }), false, NOW)).toMatch(/too old/);
  });
});

describe("cleanReason", () => {
  it("needs a few words and tidies whitespace", () => {
    expect(cleanReason("  Charged   twice by mistake ")).toEqual({ ok: true, reason: "Charged twice by mistake" });
    expect(cleanReason("hi").ok).toBe(false);
    expect(cleanReason(undefined).ok).toBe(false);
  });
  it("caps very long text", () => {
    const r = cleanReason("x".repeat(5000));
    expect(r.ok && r.reason.length).toBe(600);
  });
});

describe("amounts", () => {
  it("keeps a refund between ₹1 and what was paid", () => {
    expect(refundAmountProblem(199_900, 199_900)).toBeNull();
    expect(refundAmountProblem(99_950, 199_900)).toBeNull();
    expect(refundAmountProblem(199_901, 199_900)).toMatch(/more than/);
    expect(refundAmountProblem(50, 199_900)).toMatch(/at least/);
    expect(refundAmountProblem(10.5, 199_900)).toMatch(/at least/);
  });
  it("reads rupees typed by staff", () => {
    expect(rupeesToPaise("1,999")).toBe(199_900);
    expect(rupeesToPaise("₹999.50")).toBe(99_950);
    expect(rupeesToPaise("12.345")).toBeNaN();
    expect(rupeesToPaise("abc")).toBeNaN();
    expect(rupeesToPaise("-5")).toBeNaN();
  });
  it("never takes back more credits than they still hold", () => {
    expect(creditsToTakeBack(750, 900)).toBe(750);
    expect(creditsToTakeBack(750, 200)).toBe(200);
    expect(creditsToTakeBack(750, 0)).toBe(0);
  });
});
