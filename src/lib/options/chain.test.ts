import { describe, expect, it } from "vitest";
import { blackScholes, daysToYears } from "./black-scholes";
import { daysToExpiry, enrichChain, filterChain, historicalVol, marketOpen, spotIsStale, type RawChain, type RawSide } from "./chain";

// Tuesday 6 Oct 2026, 11:00 IST — market open; expiry the following Tuesday.
const NOW = Date.parse("2026-10-06T11:00:00+05:30");
const EXPIRY = "2026-10-13";
const SPOT = 25000;
const YEARS = daysToYears(daysToExpiry(EXPIRY, NOW));
const fair = (type: "CE" | "PE", strike: number, vol = 0.14) => blackScholes({ type, spot: SPOT, strike, years: YEARS, vol, rate: 0.065 }).price;

const blank: RawSide = { ltp: null, bid: null, ask: null, prevClose: null, volume: null, oi: null, prevOi: null, iv: null, delta: null, gamma: null, theta: null, vega: null, rho: null };
const quoted = (type: "CE" | "PE", strike: number, extra: Partial<RawSide> = {}): RawSide => {
  const p = fair(type, strike);
  return { ...blank, ltp: Math.round(p * 20) / 20, bid: Math.round(p * 0.99 * 20) / 20, ask: Math.round(p * 1.01 * 20) / 20, volume: 1000, oi: 5000, ...extra };
};
const raw = (rows: RawChain["rows"], over: Partial<RawChain> = {}): RawChain => ({ underlying: "NIFTY", expiry: EXPIRY, spot: SPOT, lotSize: 65, source: { kind: "broker", broker: "upstox", name: "Upstox" }, hasDepth: true, rows, ...over });

describe("labelled Greeks", () => {
  it("keeps the source's own Greeks as provided and calculates only what's missing (rho)", () => {
    const c = enrichChain(raw([{ strike: 25000, call: quoted("CE", 25000, { iv: 0.13, delta: 0.52, gamma: 0.0009, theta: -12, vega: 13 }), put: quoted("PE", 25000) }]), { nowMs: NOW });
    const g = c.rows[0].call.greeks;
    expect(g.iv).toEqual({ value: 0.13, origin: "provided" });
    expect(g.delta).toEqual({ value: 0.52, origin: "provided" });
    expect(g.rho.origin).toBe("calculated");
    expect(g.rho.value).toBeGreaterThan(0);
  });
  it("implies IV from the contract's own price when the source gives none", () => {
    const c = enrichChain(raw([{ strike: 25200, call: quoted("CE", 25200), put: quoted("PE", 25200) }]), { nowMs: NOW });
    expect(c.rows[0].call.greeks.iv.origin).toBe("calculated");
    expect(c.rows[0].call.greeks.iv.value).toBeCloseTo(0.14, 2);
    expect(c.rows[0].call.greeks.delta.origin).toBe("calculated");
    expect(c.rows[0].call.basis).toBe("mid");
  });
  it("only estimates Greeks for a contract with no price, from the ATM volatility", () => {
    const c = enrichChain(raw([{ strike: 25000, call: quoted("CE", 25000), put: quoted("PE", 25000) }, { strike: 27000, call: { ...blank }, put: { ...blank } }]), { nowMs: NOW });
    const far = c.rows[1].call;
    expect(far.flags).toContain("no_price");
    expect(far.price).toBeNull();
    expect(far.greeks.iv.origin).toBe("estimated");
    expect(far.greeks.iv.value).toBeCloseTo(c.atmIv!, 6);
    expect(far.greeks.delta.origin).toBe("estimated");
  });
});

describe("warnings", () => {
  it("flags wide spreads, one-sided quotes, stale last prices and dead contracts", () => {
    const c = enrichChain(
      raw([
        { strike: 25000, call: { ...blank, ltp: 100, bid: 80, ask: 120, volume: 10, oi: 10 }, put: { ...blank, ltp: 90, bid: 89, volume: 10, oi: 10 } },
        { strike: 25100, call: { ...blank, ltp: 70, volume: 0, oi: 300 }, put: { ...blank, ltp: 0, volume: 0, oi: 0 } },
      ]),
      { nowMs: NOW },
    );
    expect(c.rows[0].call.flags).toContain("wide_spread");
    expect(c.rows[0].call.basis).toBe("ltp"); // the gap is too wide to trust the mid
    expect(c.rows[0].put.flags).toContain("one_sided");
    expect(c.rows[1].call.flags).toEqual(["no_trades_today"]);
    expect(c.rows[1].put.flags).toEqual(expect.arrayContaining(["no_price", "no_activity"]));
  });
  it("doesn't call a chain without bid/ask data one-sided", () => {
    const c = enrichChain(raw([{ strike: 25000, call: { ...blank, ltp: 100, volume: 5, oi: 5 }, put: { ...blank, ltp: 90, volume: 5, oi: 5 } }], { hasDepth: false }), { nowMs: NOW });
    expect(c.rows[0].call.flags).toEqual([]);
  });
  it("marks an expired chain and gives no Greeks", () => {
    const c = enrichChain(raw([{ strike: 25000, call: quoted("CE", 25000), put: quoted("PE", 25000) }]), { nowMs: Date.parse("2026-10-13T15:31:00+05:30") });
    expect(c.notices).toContain("expired");
    expect(c.rows[0].call.flags).toContain("expired");
    expect(c.rows[0].call.greeks.delta.value).toBeNull();
  });
  it("says when the market is closed and when the spot is missing", () => {
    const c = enrichChain(raw([{ strike: 25000, call: quoted("CE", 25000), put: quoted("PE", 25000) }], { spot: null }), { nowMs: Date.parse("2026-10-06T20:00:00+05:30") });
    expect(c.notices).toEqual(["market_closed", "no_spot"]);
    expect(c.rows[0].call.greeks.delta.value).toBeNull();
    expect(marketOpen(Date.parse("2026-10-10T11:00:00+05:30"))).toBe(false); // Saturday
  });
});

describe("free-trial estimates", () => {
  it("prices every contract from the assumed volatility and labels it all an estimate", () => {
    const c = enrichChain(raw([{ strike: 25000, call: { ...blank }, put: { ...blank } }], { source: { kind: "estimate", name: "Free trial", spotFrom: "Yahoo" }, hasDepth: false }), { nowMs: NOW, assumedIv: 0.14 });
    const call = c.rows[0].call;
    expect(c.notices).toContain("trial_estimates");
    expect(call.basis).toBe("estimate");
    expect(call.price).toBeCloseTo(fair("CE", 25000), 0);
    expect(call.flags).toEqual([]);
    expect(call.greeks.iv).toEqual({ value: 0.14, origin: "estimated" });
    expect(call.greeks.vega.origin).toBe("estimated");
  });
  it("uses the underlying's recent volatility", () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 * (i % 2 ? 1.01 : 1));
    expect(historicalVol(closes)).toBeGreaterThan(0.1);
    expect(historicalVol([1, 2])).toBeNull();
  });
});

describe("filtering and paging on the server", () => {
  const rows = Array.from({ length: 41 }, (_, i) => 24000 + i * 50).map((k) => ({ strike: k, call: quoted("CE", k), put: quoted("PE", k) }));
  const chain = enrichChain(raw(rows), { nowMs: NOW });
  it("centres a window of strikes on the money", () => {
    const r = filterChain(chain, { window: 3 });
    expect(chain.atmStrike).toBe(25000);
    expect(r.rows.map((x) => x.strike)).toEqual([24850, 24900, 24950, 25000, 25050, 25100, 25150]);
  });
  it("pages the whole chain and keeps the page in range", () => {
    expect(filterChain(chain, { window: 0, size: 10, page: 5 })).toMatchObject({ total: 41, pages: 5, page: 5 });
    expect(filterChain(chain, { window: 0, size: 10, page: 5 }).rows).toHaveLength(1);
    expect(filterChain(chain, { window: 0, size: 10, page: 99 }).page).toBe(5);
    expect(filterChain(chain, { window: 0, size: 7 }).size).toBe(50); // only the offered sizes
  });
  it("finds one contract's strike, and a strike range", () => {
    expect(filterChain(chain, { strike: 24100 }).rows.map((x) => x.strike)).toEqual([24100]);
    expect(filterChain(chain, { window: 0, minStrike: 25900, maxStrike: 26000 }).rows.map((x) => x.strike)).toEqual([25900, 25950, 26000]);
  });
});

describe("stale underlying price", () => {
  const at = (s: string) => Date.parse(s);
  it("accepts last session's close, across a weekend and a holiday", () => {
    expect(spotIsStale(at("2026-10-05T15:30:00+05:30"), at("2026-10-06T01:00:00+05:30"))).toBe(false); // Monday close, Tuesday night
    expect(spotIsStale(at("2026-10-09T15:30:00+05:30"), at("2026-10-12T08:00:00+05:30"))).toBe(false); // Friday close, Monday morning
    expect(spotIsStale(at("2026-10-01T15:30:00+05:30"), at("2026-10-05T08:00:00+05:30"))).toBe(false); // 2 Oct holiday + weekend
  });
  it("flags a price a session behind, or stale during market hours", () => {
    expect(spotIsStale(at("2026-10-01T15:30:00+05:30"), at("2026-10-06T01:00:00+05:30"))).toBe(true); // misses Monday 5 Oct
    expect(spotIsStale(at("2026-10-06T10:00:00+05:30"), at("2026-10-06T11:00:00+05:30"))).toBe(true);
    expect(spotIsStale(at("2026-10-06T10:55:00+05:30"), at("2026-10-06T11:00:00+05:30"))).toBe(false);
  });
  it("shows as a notice on the chain", () => {
    const c = enrichChain(raw([{ strike: 25000, call: quoted("CE", 25000), put: quoted("PE", 25000) }], { spotAt: (NOW - 3_600_000) / 1000 }), { nowMs: NOW });
    expect(c.notices).toContain("stale_spot");
  });
});
