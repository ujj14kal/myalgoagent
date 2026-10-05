import type { NseEquity } from "@/lib/brokers/nse-master";
import type { RawRow, RawSide } from "./chain";

// Option chains from the user's own broker, through their own API session.
// Each broker's request and response follow its official docs (checked 6 Oct 2026):
//   Groww   GET  https://api.groww.in/v1/option-chain/exchange/NSE/underlying/{u}?expiry_date=yyyy-mm-dd
//           → payload.underlying_ltp, payload.strikes["23400"].CE|PE {greeks{delta,gamma,theta,vega,rho,iv%}, trading_symbol, ltp, open_interest, volume}
//   Upstox  GET  https://api.upstox.com/v2/option/chain?instrument_key=…&expiry_date=yyyy-mm-dd
//           → data[] {strike_price, underlying_spot_price, call_options|put_options {instrument_key, market_data{ltp,volume,oi,close_price,bid_price,ask_price,prev_oi}, option_greeks{vega,theta,gamma,delta,iv%}}}
//           expiries/lot size: GET https://api.upstox.com/v2/option/contract?instrument_key=… → data[] {expiry, lot_size, …}
//   Dhan    POST https://api.dhan.co/v2/optionchain {UnderlyingScrip, UnderlyingSeg, Expiry}
//           → data.last_price, data.oc["25650.000000"].ce|pe {greeks{delta,theta,gamma,vega}, implied_volatility%, last_price, oi, previous_close_price, previous_oi, volume, top_bid_price, top_ask_price, security_id}
//           expiries: POST https://api.dhan.co/v2/optionchain/expirylist {UnderlyingScrip, UnderlyingSeg} → data[]; one unique request every 3 s.
// All three give IV in percent; it's stored here as a decimal.
// Pure: request builders and parsers only (the session and sending live in chain-source.ts).

export type ChainRequest = { url: string; method: "GET" | "POST"; json?: unknown };
export type ParsedChain = { spot: number | null; rows: RawRow[]; hasDepth: boolean };

export const CHAIN_BROKERS = ["groww", "upstox", "dhan"] as const;
export type ChainBroker = (typeof CHAIN_BROKERS)[number];

const o = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const n = (v: unknown): number | null => {
  const x = typeof v === "string" && v.trim() ? Number(v) : v;
  return typeof x === "number" && Number.isFinite(x) ? x : null;
};
const ivPct = (v: unknown) => {
  const x = n(v);
  return x !== null && x > 0 ? x / 100 : null;
};
const empty = (): RawSide => ({ ltp: null, bid: null, ask: null, prevClose: null, volume: null, oi: null, prevOi: null, iv: null, delta: null, gamma: null, theta: null, vega: null, rho: null });

// ---- Groww ----
export const growwChainRequest = (underlying: string, expiry: string): ChainRequest => ({
  method: "GET",
  url: `https://api.groww.in/v1/option-chain/exchange/NSE/underlying/${encodeURIComponent(underlying)}?expiry_date=${expiry}`,
});

export function parseGrowwChain(body: unknown): ParsedChain {
  const p = o(o(body).payload);
  const side = (v: unknown): RawSide => {
    const s = o(v);
    const g = o(s.greeks);
    return { ...empty(), symbol: typeof s.trading_symbol === "string" ? s.trading_symbol : undefined, ltp: n(s.ltp), volume: n(s.volume), oi: n(s.open_interest), iv: ivPct(g.iv), delta: n(g.delta), gamma: n(g.gamma), theta: n(g.theta), vega: n(g.vega), rho: n(g.rho) };
  };
  const rows = Object.entries(o(p.strikes)).map(([k, v]) => ({ strike: Number(k), call: side(o(v).CE), put: side(o(v).PE) }));
  return { spot: n(p.underlying_ltp), rows, hasDepth: false };
}

// ---- Upstox ----
const UPSTOX_INDEX: Record<string, string> = { NIFTY: "NSE_INDEX|Nifty 50", BANKNIFTY: "NSE_INDEX|Nifty Bank", FINNIFTY: "NSE_INDEX|Nifty Fin Service", MIDCPNIFTY: "NSE_INDEX|NIFTY MID SELECT" };
export const upstoxUnderlyingKey = (underlying: string, eq: NseEquity | null): string | null => UPSTOX_INDEX[underlying] ?? (eq ? `NSE_EQ|${eq.isin}` : null);

export const upstoxChainRequest = (key: string, expiry: string): ChainRequest => ({
  method: "GET",
  url: `https://api.upstox.com/v2/option/chain?instrument_key=${encodeURIComponent(key)}&expiry_date=${expiry}`,
});
export const upstoxContractsRequest = (key: string): ChainRequest => ({ method: "GET", url: `https://api.upstox.com/v2/option/contract?instrument_key=${encodeURIComponent(key)}` });

export function parseUpstoxChain(body: unknown): ParsedChain {
  const data = Array.isArray(o(body).data) ? (o(body).data as unknown[]) : [];
  const side = (v: unknown): RawSide => {
    const s = o(v);
    const m = o(s.market_data);
    const g = o(s.option_greeks);
    return {
      ...empty(),
      symbol: typeof s.instrument_key === "string" ? s.instrument_key : undefined,
      ltp: n(m.ltp),
      bid: n(m.bid_price),
      ask: n(m.ask_price),
      prevClose: n(m.close_price),
      volume: n(m.volume),
      oi: n(m.oi),
      prevOi: n(m.prev_oi),
      iv: ivPct(g.iv),
      delta: n(g.delta),
      gamma: n(g.gamma),
      theta: n(g.theta),
      vega: n(g.vega),
    };
  };
  let spot: number | null = null;
  const rows = data.map((r) => {
    const x = o(r);
    spot ??= n(x.underlying_spot_price);
    return { strike: n(x.strike_price) ?? NaN, call: side(x.call_options), put: side(x.put_options) };
  });
  return { spot, rows, hasDepth: true };
}

/** Upcoming expiries and the lot size from Upstox's option contract list. */
export function parseUpstoxContracts(body: unknown, today: string): { expiries: string[]; lotSize: number | null } {
  const data = Array.isArray(o(body).data) ? (o(body).data as unknown[]) : [];
  const expiries = [...new Set(data.map((c) => o(c).expiry).filter((e): e is string => typeof e === "string" && /^\d{4}-\d{2}-\d{2}$/.test(e) && e >= today))].sort();
  return { expiries, lotSize: n(o(data[0]).lot_size) };
}

// ---- Dhan ----
// Dhan's security ids for the index underlyings (its docs use 13 for NIFTY); stocks use their NSE token.
const DHAN_INDEX: Record<string, number> = { NIFTY: 13, BANKNIFTY: 25 };
export const dhanUnderlying = (underlying: string, eq: NseEquity | null): { UnderlyingScrip: number; UnderlyingSeg: string } | null =>
  DHAN_INDEX[underlying] !== undefined ? { UnderlyingScrip: DHAN_INDEX[underlying], UnderlyingSeg: "IDX_I" } : eq ? { UnderlyingScrip: Number(eq.token), UnderlyingSeg: "NSE_EQ" } : null;

export const dhanChainRequest = (u: { UnderlyingScrip: number; UnderlyingSeg: string }, expiry: string): ChainRequest => ({ method: "POST", url: "https://api.dhan.co/v2/optionchain", json: { ...u, Expiry: expiry } });
export const dhanExpiriesRequest = (u: { UnderlyingScrip: number; UnderlyingSeg: string }): ChainRequest => ({ method: "POST", url: "https://api.dhan.co/v2/optionchain/expirylist", json: u });

export function parseDhanChain(body: unknown): ParsedChain {
  const d = o(o(body).data);
  const side = (v: unknown): RawSide => {
    const s = o(v);
    const g = o(s.greeks);
    return {
      ...empty(),
      symbol: s.security_id !== undefined ? String(s.security_id) : undefined,
      ltp: n(s.last_price),
      bid: n(s.top_bid_price),
      ask: n(s.top_ask_price),
      prevClose: n(s.previous_close_price),
      volume: n(s.volume),
      oi: n(s.oi),
      prevOi: n(s.previous_oi),
      iv: ivPct(s.implied_volatility),
      delta: n(g.delta),
      gamma: n(g.gamma),
      theta: n(g.theta),
      vega: n(g.vega),
    };
  };
  const rows = Object.entries(o(d.oc)).map(([k, v]) => ({ strike: Number(k), call: side(o(v).ce), put: side(o(v).pe) }));
  return { spot: n(d.last_price), rows, hasDepth: true };
}

export const parseDhanExpiries = (body: unknown, today: string): string[] =>
  (Array.isArray(o(body).data) ? (o(body).data as unknown[]) : []).filter((e): e is string => typeof e === "string" && /^\d{4}-\d{2}-\d{2}$/.test(e) && e >= today).sort();
