import { describe, expect, it } from "vitest";
import { blackScholes, impliedVol } from "./black-scholes";
import { atmStrike, buildTemplate, payoffAtExpiry, payoffNow, positionGreeks, summarize, type Leg } from "./positions";

const base = { spot: 100, strike: 100, years: 1, vol: 0.2, rate: 0.05 };

describe("Black–Scholes", () => {
  it("matches the textbook values (S=K=100, T=1, r=5%, σ=20%)", () => {
    const c = blackScholes({ ...base, type: "CE" });
    const p = blackScholes({ ...base, type: "PE" });
    expect(c.price).toBeCloseTo(10.4506, 3);
    expect(p.price).toBeCloseTo(5.5735, 3);
    expect(c.delta).toBeCloseTo(0.6368, 3);
    expect(c.gamma).toBeCloseTo(0.01876, 4);
    expect(c.vega).toBeCloseTo(0.3752, 3); // per 1 vol point
    expect(c.theta).toBeCloseTo(-6.414 / 365, 4); // per day
    expect(p.delta).toBeCloseTo(0.6368 - 1, 3);
  });

  it("satisfies put–call parity", () => {
    const k = 110;
    const c = blackScholes({ ...base, strike: k, type: "CE" }).price;
    const p = blackScholes({ ...base, strike: k, type: "PE" }).price;
    expect(c - p).toBeCloseTo(100 - k * Math.exp(-0.05), 6);
  });

  it("recovers implied volatility from a price", () => {
    for (const vol of [0.08, 0.2, 0.55]) {
      const price = blackScholes({ ...base, strike: 105, vol, type: "PE" }).price;
      expect(impliedVol(price, { ...base, strike: 105, type: "PE" })).toBeCloseTo(vol, 5);
    }
    expect(impliedVol(0.01, { ...base, strike: 50, type: "CE" })).toBeNull(); // below intrinsic
  });

  it("is worth intrinsic value at expiry", () => {
    expect(blackScholes({ ...base, spot: 120, years: 0, type: "CE" }).price).toBe(20);
    expect(blackScholes({ ...base, spot: 120, years: 0, type: "PE" }).price).toBe(0);
  });
});

const opt = (type: "CE" | "PE", side: "BUY" | "SELL", strike: number, premium: number): Leg => ({
  kind: "OPTION",
  type,
  side,
  strike,
  premium,
  lots: 1,
  lotSize: 1,
  expiryDays: 30,
  iv: 0.2,
});

describe("positions", () => {
  it("long straddle: two breakevens, limited loss, unlimited profit", () => {
    const s = summarize([opt("CE", "BUY", 100, 10), opt("PE", "BUY", 100, 5)]);
    expect(s.netPremium).toBe(-15);
    expect(s.breakevens).toEqual([85, 115]);
    expect(s.maxLoss).toBe(-15);
    expect(s.maxProfit).toBeNull();
  });

  it("short call: unlimited loss", () => {
    const s = summarize([opt("CE", "SELL", 100, 4)]);
    expect(s.maxProfit).toBe(4);
    expect(s.maxLoss).toBeNull();
    expect(s.breakevens).toEqual([104]);
  });

  it("bull call spread: capped both ways", () => {
    const s = summarize([opt("CE", "BUY", 100, 6), opt("CE", "SELL", 110, 2)]);
    expect(s.maxLoss).toBe(-4);
    expect(s.maxProfit).toBe(6);
    expect(s.breakevens).toEqual([104]);
  });

  it("iron condor: max profit = credit, max loss = wing width − credit", () => {
    const legs = [opt("PE", "BUY", 80, 1), opt("PE", "SELL", 90, 3), opt("CE", "SELL", 110, 3), opt("CE", "BUY", 120, 1)];
    const s = summarize(legs);
    expect(s.netPremium).toBe(4);
    expect(s.maxProfit).toBe(4);
    expect(s.maxLoss).toBe(-6);
    expect(s.breakevens).toEqual([86, 114]);
    expect(payoffAtExpiry(legs, 100)).toBe(4);
  });

  it("scales with lots and lot size", () => {
    const leg: Leg = { ...opt("CE", "BUY", 100, 10), lots: 2, lotSize: 75 };
    expect(summarize([leg]).netPremium).toBe(-1500);
  });

  it("today's value converges to the expiry payoff", () => {
    const legs = [opt("CE", "BUY", 100, 3)];
    expect(payoffNow(legs, 105, 0.065, 30)).toBeCloseTo(payoffAtExpiry(legs, 105), 6);
  });

  it("a straddle is roughly delta-neutral at the money", () => {
    const g = positionGreeks([opt("CE", "BUY", 100, 3), opt("PE", "BUY", 100, 3)], 100, 0.065);
    expect(Math.abs(g.delta)).toBeLessThan(0.15);
    expect(g.gamma).toBeGreaterThan(0);
    expect(g.theta).toBeLessThan(0);
  });

  it("builds templates around the ATM strike", () => {
    expect(atmStrike(24_987, 50)).toBe(25_000);
    const ic = buildTemplate("iron-condor", { spot: 24_987, step: 50, expiryDays: 7, iv: 0.13, rate: 0.065, lots: 1, lotSize: 75 });
    expect(ic.map((l) => `${l.side} ${l.strike}${l.type}`)).toEqual(["BUY 24800PE", "SELL 24900PE", "SELL 25100CE", "BUY 25200CE"]);
    expect(ic.every((l) => l.premium >= 0.05 && Math.round(l.premium * 20) === l.premium * 20)).toBe(true);
  });
});
