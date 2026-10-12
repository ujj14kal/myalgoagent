import { describe, expect, it } from "vitest";
import { POLICY, cleanReason, creditsToTakeBack, policyDeadline, policyVerdict, refundAmountProblem, requestProblem, rupeesToPaise } from "./refund-rules";

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

describe("policyDeadline (3 working days, Indian time, weekends skipped)", () => {
  const at = (iso: string) => policyDeadline(new Date(iso)).toISOString();
  it("counts Mon–Fri after the payment's own day", () => {
    // Tuesday 13 Oct 2026 10:00 IST → Wed, Thu, Fri → end of Fri 16 Oct (23:59:59.999 IST)
    expect(at("2026-10-13T04:30:00Z")).toBe("2026-10-16T18:29:59.999Z");
  });
  it("skips the weekend", () => {
    // Thursday 15 Oct → Fri 16 (1), Mon 19 (2), Tue 20 (3)
    expect(at("2026-10-15T04:30:00Z")).toBe("2026-10-20T18:29:59.999Z");
    // Saturday 17 Oct → Mon 19 (1), Tue 20 (2), Wed 21 (3)
    expect(at("2026-10-17T04:30:00Z")).toBe("2026-10-21T18:29:59.999Z");
  });
  it("uses Indian midnight, not UTC", () => {
    // 11:30 pm IST Tuesday is still Tuesday (18:00 UTC): same result as the morning
    expect(at("2026-10-13T18:00:00Z")).toBe("2026-10-16T18:29:59.999Z");
    // 00:30 am IST Wednesday 14 Oct (= 19:00 UTC Tuesday) is Wednesday: → Thu, Fri, Mon 19
    expect(at("2026-10-13T19:00:00Z")).toBe("2026-10-19T18:29:59.999Z");
  });
});

describe("policyVerdict", () => {
  const base = { kind: "subscription", amountPaise: 199_900, paidAt: new Date("2026-10-13T04:30:00Z"), askedAt: new Date("2026-10-14T05:00:00Z"), creditsUsed: 0, planCredits: 1500 };
  it("refunds a plan payment asked about in time with no credits used, less the ₹100 charge", () => {
    const v = policyVerdict(base);
    expect(v.eligible).toBe(true);
    expect(v.refundPaise).toBe(189_900);
    expect(v.feePaise).toBe(POLICY.feePaise);
    expect(v.reason).toBeNull();
  });
  it("allows use under 5% but not 5% or more", () => {
    expect(policyVerdict({ ...base, creditsUsed: 74 }).eligible).toBe(true); // 4.9%
    const v = policyVerdict({ ...base, creditsUsed: 75 }); // exactly 5%
    expect(v.eligible).toBe(false);
    expect(v.reason).toMatch(/less than 5%/);
  });
  it("needs the request inside the 3 working days", () => {
    expect(policyVerdict({ ...base, askedAt: new Date("2026-10-16T18:00:00Z") }).eligible).toBe(true); // Fri 11:30pm IST
    const late = policyVerdict({ ...base, askedAt: new Date("2026-10-16T19:00:00Z") }); // Sat 00:30 IST
    expect(late.eligible).toBe(false);
    expect(late.reason).toMatch(/3 working days/);
  });
  it("never refunds credit top-ups", () => {
    const v = policyVerdict({ ...base, kind: "topup" });
    expect(v.eligible).toBe(false);
    expect(v.reason).toMatch(/one-time payments.*final/i);
  });
});
