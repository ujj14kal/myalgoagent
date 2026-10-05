import type { Candle, CandleInterval } from "@/lib/market-data/types";
import type { NseEquity } from "./nse-master";
import { arr, num, obj, text } from "./live-brokers";
import type { BrokerId } from "./catalog";

// Candles from the user's own broker, for that user's own charts, backtests and strategies.
// Each broker is described as pure functions — which intervals it serves natively, how far one
// request may reach, how to build the request and how to read the answer — so all of it is
// testable without a network. Endpoints are from each broker's official API docs / SDKs
// (5 Oct 2026); the request itself is sent by broker-data.ts through the static-IP relay.
//
// Intervals a broker doesn't serve are built from smaller ones by the caller (3m from 1m, …).

export type BrokerRequest = { url: string; method: "GET" | "POST"; json?: unknown };

export type CandleSpec = {
  /** The broker's own name for the interval. */
  code: string;
  /** Longest span one request may cover, in days. */
  maxDays: number;
};

export type BrokerCandleSource = {
  id: BrokerId;
  /** Natively served intervals; anything else is derived from these. */
  intervals: Partial<Record<CandleInterval, CandleSpec>>;
  /** How far back intraday history goes, in days (for capping long backtests). */
  intradayHistoryDays: number;
  request(eq: NseEquity, spec: CandleSpec, interval: CandleInterval, fromSec: number, toSec: number): BrokerRequest[];
  parse(body: unknown): Candle[];
};

const IST = 5.5 * 3600;
/** "yyyy-MM-dd HH:mm:ss" (or without seconds / date only) in IST for a unix time. */
export function istString(sec: number, form: "datetime" | "minute" | "date" = "datetime"): string {
  const iso = new Date((sec + IST) * 1000).toISOString(); // shifted so the wall clock reads IST
  const date = iso.slice(0, 10);
  if (form === "date") return date;
  return form === "minute" ? `${date} ${iso.slice(11, 16)}` : `${date} ${iso.slice(11, 19)}`;
}

/** A broker timestamp → unix seconds. Epoch seconds/ms pass through; a wall-clock time with no offset is IST. */
export function brokerTime(v: unknown): number | null {
  const n = num(v);
  if (n !== null) return n > 1e12 ? Math.floor(n / 1000) : Math.floor(n);
  const s = text(v);
  if (!s) return null;
  const iso = s.replace(" ", "T");
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso.replace(/([+-]\d\d)(\d\d)$/, "$1:$2") : `${iso}+05:30`);
  return Number.isNaN(d.getTime()) ? null : Math.floor(d.getTime() / 1000);
}

/** Rows of [time, open, high, low, close, volume, …] → candles (bad rows skipped), oldest first. */
export function rowsToCandles(rows: unknown): Candle[] {
  const out: Candle[] = [];
  for (const r of arr(rows)) {
    const a = arr(r);
    const time = brokerTime(a[0]);
    const [open, high, low, close] = [num(a[1]), num(a[2]), num(a[3]), num(a[4])];
    if (time === null || open === null || high === null || low === null || close === null) continue;
    out.push({ time, open, high, low, close, volume: num(a[5]) ?? 0 });
  }
  return out.sort((x, y) => x.time - y.time);
}

/** Splits [from, to] into windows of at most `days`. */
export function windows(fromSec: number, toSec: number, days: number): [number, number][] {
  const step = Math.max(1, days) * 86400;
  const out: [number, number][] = [];
  for (let a = fromSec; a < toSec; a += step) out.push([a, Math.min(toSec, a + step - 1)]);
  return out.length ? out : [[fromSec, toSec]];
}

const q = (o: Record<string, string | number>) => new URLSearchParams(Object.entries(o).map(([k, v]) => [k, String(v)])).toString();

// ---------- Groww: GET /v1/historical/candles (data from 2020) ----------
const groww: BrokerCandleSource = {
  id: "groww",
  intradayHistoryDays: 365 * 5,
  intervals: {
    "1m": { code: "1minute", maxDays: 30 },
    "5m": { code: "5minute", maxDays: 30 },
    "15m": { code: "15minute", maxDays: 90 },
    "30m": { code: "30minute", maxDays: 90 },
    "60m": { code: "1hour", maxDays: 180 },
    "4h": { code: "4hours", maxDays: 180 },
    "1d": { code: "1day", maxDays: 180 },
    "1wk": { code: "1week", maxDays: 180 },
    "1mo": { code: "1month", maxDays: 180 },
  },
  request: (eq, spec, _i, from, to) =>
    windows(from, to, spec.maxDays).map(([a, b]) => ({
      method: "GET",
      url: `https://api.groww.in/v1/historical/candles?${q({ exchange: "NSE", segment: "CASH", groww_symbol: `NSE-${eq.symbol}`, start_time: istString(a), end_time: istString(b), candle_interval: spec.code })}`,
    })),
  parse: (body) => rowsToCandles(obj(obj(body).payload).candles),
};

// ---------- Zerodha (Kite Connect): GET /instruments/historical/{token}/{interval} ----------
/** Kite's instrument_token for an NSE equity: the exchange token × 256 + 1 (NSE). Checked against Kite's instrument list. */
export const kiteInstrumentToken = (nseToken: string) => Number(nseToken) * 256 + 1;
const zerodha: BrokerCandleSource = {
  id: "zerodha",
  intradayHistoryDays: 365 * 5,
  intervals: {
    "1m": { code: "minute", maxDays: 55 },
    "3m": { code: "3minute", maxDays: 95 },
    "5m": { code: "5minute", maxDays: 95 },
    "15m": { code: "15minute", maxDays: 195 },
    "30m": { code: "30minute", maxDays: 195 },
    "60m": { code: "60minute", maxDays: 395 },
    "1d": { code: "day", maxDays: 1995 },
  },
  request: (eq, spec, _i, from, to) =>
    windows(from, to, spec.maxDays).map(([a, b]) => ({
      method: "GET",
      url: `https://api.kite.trade/instruments/historical/${kiteInstrumentToken(eq.token)}/${spec.code}?${q({ from: istString(a), to: istString(b) })}`,
    })),
  parse: (body) => rowsToCandles(obj(obj(body).data).candles),
};

// ---------- Upstox v3: historical (to yesterday) + intraday (today) ----------
const upstoxKey = (eq: NseEquity) => encodeURIComponent(`NSE_EQ|${eq.isin}`);
const upstox: BrokerCandleSource = {
  id: "upstox",
  intradayHistoryDays: 365 * 3, // minutes data from Jan 2022
  intervals: {
    "1m": { code: "minutes/1", maxDays: 28 },
    "3m": { code: "minutes/3", maxDays: 28 },
    "5m": { code: "minutes/5", maxDays: 28 },
    "15m": { code: "minutes/15", maxDays: 28 },
    "30m": { code: "minutes/30", maxDays: 85 },
    "60m": { code: "hours/1", maxDays: 85 },
    "1d": { code: "days/1", maxDays: 3000 },
    "1wk": { code: "weeks/1", maxDays: 3000 },
    "1mo": { code: "months/1", maxDays: 3000 },
  },
  request: (eq, spec, interval, from, to) => {
    const reqs: BrokerRequest[] = windows(from, to, spec.maxDays).map(([a, b]) => ({
      method: "GET",
      url: `https://api.upstox.com/v3/historical-candle/${upstoxKey(eq)}/${spec.code}/${istString(b, "date")}/${istString(a, "date")}`,
    }));
    // The historical endpoint stops before today; today's candles come from the intraday one.
    const today = istString(Math.floor(Date.now() / 1000), "date");
    if (istString(to, "date") >= today && !["1wk", "1mo"].includes(interval)) {
      reqs.push({ method: "GET", url: `https://api.upstox.com/v3/historical-candle/intraday/${upstoxKey(eq)}/${spec.code}` });
    }
    return reqs;
  },
  parse: (body) => rowsToCandles(obj(obj(body).data).candles),
};

// ---------- Fyers v3: GET https://api-t1.fyers.in/data/history ----------
const fyers: BrokerCandleSource = {
  id: "fyers",
  intradayHistoryDays: 365 * 3,
  intervals: {
    "1m": { code: "1", maxDays: 95 },
    "3m": { code: "3", maxDays: 95 },
    "5m": { code: "5", maxDays: 95 },
    "15m": { code: "15", maxDays: 95 },
    "30m": { code: "30", maxDays: 95 },
    "60m": { code: "60", maxDays: 95 },
    "4h": { code: "240", maxDays: 95 },
    "1d": { code: "1D", maxDays: 360 },
  },
  request: (eq, spec, _i, from, to) =>
    windows(from, to, spec.maxDays).map(([a, b]) => ({
      method: "GET",
      url: `https://api-t1.fyers.in/data/history?${q({ symbol: `NSE:${eq.symbol}-${eq.series}`, resolution: spec.code, date_format: 0, range_from: a, range_to: b, cont_flag: 1 })}`,
    })),
  parse: (body) => rowsToCandles(obj(body).candles),
};

// ---------- Angel One (SmartAPI): POST /rest/secure/angelbroking/historical/v1/getCandleData ----------
const angelone: BrokerCandleSource = {
  id: "angelone",
  intradayHistoryDays: 365 * 2,
  intervals: {
    "1m": { code: "ONE_MINUTE", maxDays: 29 },
    "3m": { code: "THREE_MINUTE", maxDays: 59 },
    "5m": { code: "FIVE_MINUTE", maxDays: 99 },
    "15m": { code: "FIFTEEN_MINUTE", maxDays: 199 },
    "30m": { code: "THIRTY_MINUTE", maxDays: 199 },
    "60m": { code: "ONE_HOUR", maxDays: 399 },
    "1d": { code: "ONE_DAY", maxDays: 1999 },
  },
  request: (eq, spec, _i, from, to) =>
    windows(from, to, spec.maxDays).map(([a, b]) => ({
      method: "POST",
      url: "https://apiconnect.angelone.in/rest/secure/angelbroking/historical/v1/getCandleData",
      json: { exchange: "NSE", symboltoken: eq.token, interval: spec.code, fromdate: istString(a, "minute"), todate: istString(b, "minute") },
    })),
  parse: (body) => rowsToCandles(obj(body).data),
};

// ---------- Dhan v2: POST /v2/charts/intraday, /v2/charts/historical ----------
const dhan: BrokerCandleSource = {
  id: "dhan",
  intradayHistoryDays: 365 * 5,
  intervals: {
    "1m": { code: "1", maxDays: 89 },
    "5m": { code: "5", maxDays: 89 },
    "15m": { code: "15", maxDays: 89 },
    "60m": { code: "60", maxDays: 89 },
    "1d": { code: "D", maxDays: 365 },
  },
  request: (eq, spec, _i, from, to) =>
    windows(from, to, spec.maxDays).map(([a, b]) =>
      spec.code === "D"
        ? { method: "POST", url: "https://api.dhan.co/v2/charts/historical", json: { securityId: eq.token, exchangeSegment: "NSE_EQ", instrument: "EQUITY", expiryCode: 0, oi: false, fromDate: istString(a, "date"), toDate: istString(b + 86400, "date") } }
        : { method: "POST", url: "https://api.dhan.co/v2/charts/intraday", json: { securityId: eq.token, exchangeSegment: "NSE_EQ", instrument: "EQUITY", interval: spec.code, oi: false, fromDate: istString(a), toDate: istString(b) } },
    ),
  parse: (body) => {
    const b = obj(body);
    const [t, o, h, l, c, v] = ["timestamp", "open", "high", "low", "close", "volume"].map((k) => arr(b[k]));
    return rowsToCandles(t.map((x, i) => [x, o[i], h[i], l[i], c[i], v[i]]));
  },
};

// ---------- 5paisa: GET https://openapi.5paisa.com/V2/historical/{Exch}/{ExchType}/{ScripCode}/{interval} ----------
const fivepaisa: BrokerCandleSource = {
  id: "5paisa",
  intradayHistoryDays: 180,
  intervals: {
    "1m": { code: "1m", maxDays: 30 },
    "3m": { code: "3m", maxDays: 30 },
    "5m": { code: "5m", maxDays: 30 },
    "15m": { code: "15m", maxDays: 60 },
    "30m": { code: "30m", maxDays: 60 },
    "60m": { code: "60m", maxDays: 60 },
    "1d": { code: "1d", maxDays: 365 },
  },
  request: (eq, spec, _i, from, to) =>
    windows(from, to, spec.maxDays).map(([a, b]) => ({
      method: "GET",
      url: `https://openapi.5paisa.com/V2/historical/N/C/${eq.token}/${spec.code}?${q({ from: istString(a, "date"), end: istString(b, "date") })}`,
    })),
  parse: (body) => rowsToCandles(obj(obj(body).data).candles),
};

/**
 * Brokers we read candles from. Not here, with the reason shown to the user:
 *  - Alice Blue: its history API is closed during market hours (17:30–08:00 only), so it can't feed live signals.
 *  - ICICI Direct: identifies stocks by its own codes (same blocker as its live orders).
 */
export const CANDLE_SOURCES: Partial<Record<BrokerId, BrokerCandleSource>> = { groww, zerodha, upstox, fyers, angelone, dhan, "5paisa": fivepaisa };

export const NO_CANDLES_REASON: Partial<Record<BrokerId, string>> = {
  aliceblue: "Alice Blue's history API only answers outside market hours, so it can't feed live signals.",
  icicidirect: "ICICI Direct identifies stocks by its own codes; market data from it will follow with its live orders.",
};
