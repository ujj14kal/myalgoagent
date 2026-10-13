import { describe, expect, it } from "vitest";
import { ACTION_COST, PLANS, TOPUP_PACKS, TRIAL_DAYS, TRIAL_SPEC, backtestCost, effectivePlan, priceOf, refusalFor, slotRefusal, splitSpend, type Usage } from "./config";

const none: Usage = { aiToday: 0, buildsToday: 0, voiceToday: 0, aiRepliesEver: 0 };

describe("backtestCost", () => {
  it("is 1 for daily candles up to a year, 2 for intraday or a long history, 3 for both", () => {
    expect(backtestCost({ timeframe: "1d", range: "1y" })).toBe(1);
    expect(backtestCost({ timeframe: "1wk", range: "6mo" })).toBe(1);
    expect(backtestCost({ timeframe: "15m", range: "1mo" })).toBe(2);
    expect(backtestCost({ timeframe: "1d", range: "5y" })).toBe(2);
    expect(backtestCost({ timeframe: "15m", range: "1y" })).toBe(3);
    expect(backtestCost({ timeframe: "30m", range: "5y" })).toBe(3);
  });
});

describe("splitSpend", () => {
  it("uses monthly credits first, then top-ups, and refuses to overdraw", () => {
    expect(splitSpend({ monthly: 10, topup: 100 }, 4)).toEqual({ monthly: 6, topup: 100 });
    expect(splitSpend({ monthly: 3, topup: 100 }, 5)).toEqual({ monthly: 0, topup: 98 });
    expect(splitSpend({ monthly: 1, topup: 1 }, 3)).toBeNull();
  });
});

describe("refusalFor — free plan", () => {
  const bal = { monthly: 20, topup: 0 };
  it("allows exactly two AI replies for the life of the account, free of credits", () => {
    expect(refusalFor("FREE", bal, { ...none, aiRepliesEver: 1 }, "ai_reply", 2)).toBeNull();
    const r = refusalFor("FREE", bal, { ...none, aiRepliesEver: 2 }, "ai_build", 5);
    expect(r?.code).toBe("FREE_AI_USED");
  });
  it("has no voice and no big backtests", () => {
    expect(refusalFor("FREE", bal, none, "ai_voice", 6)?.code).toBe("NOT_ON_PLAN");
    expect(refusalFor("FREE", bal, none, "backtest", 2)?.code).toBe("NOT_ON_PLAN");
    expect(refusalFor("FREE", bal, none, "backtest", 1)).toBeNull();
  });
  it("runs out of backtests when the 20 credits are spent", () => {
    expect(refusalFor("FREE", { monthly: 0, topup: 0 }, none, "backtest", 1)?.code).toBe("NO_CREDITS");
  });
});

describe("refusalFor — paid plans", () => {
  const bal = { monthly: 500, topup: 0 };
  it("stops at the daily ceilings whatever the balance", () => {
    expect(refusalFor("TRADE", bal, { ...none, aiToday: 60 }, "ai_reply", 2)?.code).toBe("DAILY_CAP");
    expect(refusalFor("TRADE", bal, { ...none, aiToday: 10, buildsToday: 20 }, "ai_build", 5)?.code).toBe("DAILY_CAP");
    expect(refusalFor("TRADE", bal, { ...none, voiceToday: 20 }, "ai_voice", 6)?.code).toBe("DAILY_CAP");
    expect(refusalFor("PRO", bal, { ...none, aiToday: 60 }, "ai_reply", 2)).toBeNull();
  });
  it("stops when the credits are gone and says how many are needed", () => {
    const r = refusalFor("TRADE", { monthly: 1, topup: 0 }, none, "ai_build", 5);
    expect(r?.code).toBe("NO_CREDITS");
    expect(r?.message).toMatch(/needs 5 credits and you have 1/);
  });
  it("lets top-up credits pay when the monthly ones are gone", () => {
    expect(refusalFor("TRADE", { monthly: 0, topup: 300 }, none, "ai_reply", 2)).toBeNull();
  });
  it("voice and big backtests are on", () => {
    expect(refusalFor("TRADE", bal, none, "ai_voice", 6)).toBeNull();
    expect(refusalFor("TRADE", bal, none, "backtest", 3)).toBeNull();
  });
});

describe("the price list", () => {
  it("quotes prices from one table", () => {
    expect(priceOf("ai_voice")).toBe(ACTION_COST.ai_voice);
    expect(priceOf("backtest", { timeframe: "5m", range: "1mo" })).toBe(2);
  });
  it("keeps the plans and top-ups as agreed", () => {
    expect(PLANS.TRADE.price).toBe(1999);
    expect(PLANS.PRO.price).toBe(3499);
    expect(PLANS.FREE.aiLifetimeReplies).toBe(2);
    // Every pack stays above Pro's plan rate per credit (so upgrading is always the better deal) and keeps a 30% margin even at the worst-case ₹0.33 of cost per credit, after 18% GST and 2.36% payment fees.
    const proRate = PLANS.PRO.price! / PLANS.PRO.monthlyCredits;
    for (const p of TOPUP_PACKS) {
      expect(p.price / p.credits).toBeGreaterThan(proRate);
      const kept = p.price - p.price * 0.0236;
      expect((kept - p.credits * 0.33) / kept).toBeGreaterThan(0.3);
    }
    // Plans: at the realistic ₹0.14 a credit, spending every credit still leaves 40%+ of the price after the IP (₹640) and payment fees (3.5%).
    for (const p of [PLANS.TRADE, PLANS.PRO]) {
      const left = p.price! - 640 - p.price! * 1.18 * 0.0299 - 20 - p.monthlyCredits * 0.14;
      expect(left / p.price!).toBeGreaterThan(0.4);
    }
  });
});

describe("slot limits", () => {
  it("free cannot go live, paid plans stop at their cap", () => {
    expect(slotRefusal("FREE", "live", 0)?.code).toBe("NOT_ON_PLAN");
    expect(slotRefusal("FREE", "forward", 0)?.code).toBe("NOT_ON_PLAN");
    expect(slotRefusal("TRADE", "live", 4)).toBeNull();
    expect(slotRefusal("TRADE", "live", 5)?.code).toBe("SLOTS_FULL");
    expect(slotRefusal("PRO", "forward", 99)).toBeNull();
    expect(slotRefusal("PRO", "forward", 100)?.code).toBe("SLOTS_FULL");
  });
});

describe("the 7-day trial", () => {
  const usage = { aiToday: 0, buildsToday: 0, voiceToday: 0, aiRepliesEver: 5 };
  it("is Free with an end date: behaves as the trial until then, as Free after", () => {
    const now = new Date("2026-10-12T10:00:00Z");
    expect(effectivePlan("FREE", new Date("2026-10-15T00:00:00Z"), now)).toBe("TRIAL");
    expect(effectivePlan("FREE", new Date("2026-10-11T00:00:00Z"), now)).toBe("FREE");
    expect(effectivePlan("FREE", null, now)).toBe("FREE");
    expect(effectivePlan("TRADE", new Date("2026-10-15T00:00:00Z"), now)).toBe("TRADE"); // a paid plan is never the trial
  });
  it("lets a new account try the paid features, but not go live", () => {
    expect(refusalFor("TRIAL", { monthly: 300, topup: 0 }, usage, "ai_voice", 6)).toBeNull();
    expect(refusalFor("TRIAL", { monthly: 300, topup: 0 }, usage, "backtest", 3)).toBeNull();
    expect(refusalFor("TRIAL", { monthly: 300, topup: 0 }, usage, "ai_reply", 2)).toBeNull(); // not limited to 2 lifetime replies
    expect(slotRefusal("TRIAL", "live", 0)?.code).toBe("NOT_ON_PLAN");
    expect(slotRefusal("TRIAL", "forward", 4)).toBeNull();
    expect(slotRefusal("TRIAL", "forward", 5)?.code).toBe("SLOTS_FULL");
  });
  it("has daily ceilings and points to the paid plans when credits run out", () => {
    expect(refusalFor("TRIAL", { monthly: 300, topup: 0 }, { ...usage, aiToday: TRIAL_SPEC.daily.ai }, "ai_reply", 2)?.code).toBe("DAILY_CAP");
    const r = refusalFor("TRIAL", { monthly: 1, topup: 0 }, usage, "ai_build", 5);
    expect(r?.code).toBe("NO_CREDITS");
    expect(r?.message).toMatch(/Trade and Pro/);
  });
  it("costs us at most about ₹100 per account (300 credits at the worst-case ₹0.33)", () => {
    expect(TRIAL_SPEC.monthlyCredits * 0.33).toBeLessThanOrEqual(100);
    expect(TRIAL_DAYS).toBe(7);
  });
});
