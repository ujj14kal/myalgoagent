import { describe, expect, it } from "vitest";
import { dhanUnderlying, parseDhanChain, parseDhanExpiries, parseGrowwChain, parseUpstoxChain, parseUpstoxContracts, upstoxUnderlyingKey } from "./broker-chains";

// Response samples from each broker's official API docs (6 Oct 2026): Groww and Upstox verbatim; the Dhan sample is
// the docs' own (strike key, last_price, greeks, implied_volatility, oi) filled out with its other documented fields.

const GROWW = {
  status: "SUCCESS",
  payload: {
    underlying_ltp: 25641.7,
    strikes: {
      "23400": {
        CE: { greeks: { delta: 0.9936, gamma: 0, theta: -1.0787, vega: 0.6943, rho: 5.1802, iv: 25.3409 }, trading_symbol: "NIFTY25N1823400CE", ltp: 2200, open_interest: 7, volume: 5 },
        PE: { greeks: { delta: -0.0064, gamma: 0, theta: -1.0787, vega: 0.6943, rho: -0.0373, iv: 25.3409 }, trading_symbol: "NIFTY25N1823400PE", ltp: 2.05, open_interest: 7453, volume: 9339 },
      },
    },
  },
};

const UPSTOX = {
  status: "success",
  data: [
    {
      expiry: "2025-02-13",
      pcr: 7515.3,
      strike_price: 21100,
      underlying_key: "NSE_INDEX|Nifty 50",
      underlying_spot_price: 22976.2,
      call_options: {
        instrument_key: "NSE_FO|51059",
        market_data: { ltp: 2449.9, volume: 0, oi: 750, close_price: 2449.9, bid_price: 1856.65, bid_qty: 1125, ask_price: 1941.65, ask_qty: 1125, prev_oi: 1500 },
        option_greeks: { vega: 4.1731, theta: -472.8941, gamma: 0.0001, delta: 0.743, iv: 262.31, pop: 40.56 },
      },
      put_options: {
        instrument_key: "NSE_FO|51060",
        market_data: { ltp: 0.3, volume: 22315725, oi: 5636475, close_price: 0.35, bid_price: 0.3, bid_qty: 1979400, ask_price: 0.35, ask_qty: 2152500, prev_oi: 5797500 },
        option_greeks: { vega: 0.0568, theta: -1.2461, gamma: 0, delta: -0.0013, iv: 50.78, pop: 0.15 },
      },
    },
  ],
};

const DHAN = {
  data: {
    last_price: 25642.8,
    oc: {
      "25650.000000": {
        ce: { average_price: 146.99, greeks: { delta: 0.53871, theta: -15.1539, gamma: 0.00132, vega: 12.18593 }, implied_volatility: 9.789193798280868, last_price: 134, oi: 3786445, previous_close_price: 244.85, previous_oi: 402220, volume: 117567970, security_id: 42528, top_ask_price: 134, top_bid_price: 133.55 },
        pe: { greeks: { delta: -0.46, theta: -13.9, gamma: 0.0013, vega: 12.2 }, implied_volatility: 13.1, last_price: 132.8, oi: 3428310, volume: 141123190, top_ask_price: 133, top_bid_price: 132.8 },
      },
    },
  },
  status: "success",
};

describe("Groww option chain", () => {
  it("reads strikes, prices, OI and all five Greeks, with IV converted from percent", () => {
    const c = parseGrowwChain(GROWW);
    expect(c.spot).toBe(25641.7);
    expect(c.hasDepth).toBe(false);
    expect(c.rows[0]).toMatchObject({ strike: 23400, call: { symbol: "NIFTY25N1823400CE", ltp: 2200, oi: 7, volume: 5, delta: 0.9936, rho: 5.1802, bid: null } });
    expect(c.rows[0].call.iv).toBeCloseTo(0.253409, 6);
    expect(c.rows[0].put.ltp).toBe(2.05);
  });
});

describe("Upstox option chain", () => {
  it("reads depth, previous OI and Greeks (no rho)", () => {
    const c = parseUpstoxChain(UPSTOX);
    expect(c.spot).toBe(22976.2);
    expect(c.rows[0]).toMatchObject({ strike: 21100, call: { bid: 1856.65, ask: 1941.65, prevOi: 1500, prevClose: 2449.9, volume: 0, delta: 0.743, rho: null } });
    expect(c.rows[0].call.iv).toBeCloseTo(2.6231, 4);
    expect(c.rows[0].put.oi).toBe(5636475);
  });
  it("maps underlyings and lists upcoming expiries", () => {
    expect(upstoxUnderlyingKey("NIFTY", null)).toBe("NSE_INDEX|Nifty 50");
    expect(upstoxUnderlyingKey("RELIANCE", { token: "2885", isin: "INE002A01018" } as never)).toBe("NSE_EQ|INE002A01018");
    expect(upstoxUnderlyingKey("XYZ", null)).toBeNull();
    const body = { data: [{ expiry: "2026-10-13", lot_size: 65 }, { expiry: "2026-10-06", lot_size: 65 }, { expiry: "2026-10-13", lot_size: 65 }, { expiry: "2026-09-29", lot_size: 65 }] };
    expect(parseUpstoxContracts(body, "2026-10-06")).toEqual({ expiries: ["2026-10-06", "2026-10-13"], lotSize: 65 });
  });
});

describe("Dhan option chain", () => {
  it("reads decimal-string strikes, top bid/ask and Greeks", () => {
    const c = parseDhanChain(DHAN);
    expect(c.spot).toBe(25642.8);
    expect(c.rows[0]).toMatchObject({ strike: 25650, call: { ltp: 134, bid: 133.55, ask: 134, oi: 3786445, prevOi: 402220, symbol: "42528", delta: 0.53871 } });
    expect(c.rows[0].call.iv).toBeCloseTo(0.09789, 4);
  });
  it("maps underlyings and filters past expiries", () => {
    expect(dhanUnderlying("NIFTY", null)).toEqual({ UnderlyingScrip: 13, UnderlyingSeg: "IDX_I" });
    expect(dhanUnderlying("RELIANCE", { token: "2885", isin: "x" } as never)).toEqual({ UnderlyingScrip: 2885, UnderlyingSeg: "NSE_EQ" });
    expect(dhanUnderlying("FINNIFTY", null)).toBeNull();
    expect(parseDhanExpiries({ data: ["2026-10-13", "2026-09-29", "2026-10-06"] }, "2026-10-06")).toEqual(["2026-10-06", "2026-10-13"]);
  });
});

describe("odd responses", () => {
  it("never throw — an empty or error body is an empty chain", () => {
    for (const parse of [parseGrowwChain, parseUpstoxChain, parseDhanChain]) {
      expect(parse({}).rows).toEqual([]);
      expect(parse(null).rows).toEqual([]);
      expect(parse({ status: "FAILURE" }).spot).toBeNull();
    }
  });
});
