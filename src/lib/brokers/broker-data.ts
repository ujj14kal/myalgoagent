import "server-only";
import type { Candle, CandleInterval, CandleRange, MarketDataProvider } from "@/lib/market-data/types";
import { fixedBucket, fourHourBucket, istDayAndMinute, resampleCandles } from "@/lib/market-data/resample";
import { BrokerError, brokerMessage } from "./adapters";
import { brokerFetch } from "./egress";
import { brokerById, type BrokerId } from "./catalog";
import { nseEquity } from "./nse-lookup";
import { angelHeaders, dhanHeaders, fpHeaders, fyersHeaders, kiteHeaders, obj, text, upstoxHeaders, type LiveCtx } from "./live-brokers";
import { CANDLE_SOURCES, NO_CANDLES_REASON, type BrokerCandleSource, type BrokerRequest } from "./broker-candles";

// Market data from the user's OWN broker account, through their own API session — never shared
// with anyone else. Charts, backtests and live strategies use it when the user's broker supplies
// data; see docs/market-data-strategy.md for why (NSE licensing).

/** The user's broker didn't give data: no data plan, logged out, stock not covered… Callers fall back. */
export class BrokerDataUnavailable extends Error {
  constructor(message: string, readonly reason: "no_source" | "logged_out" | "no_access" | "unsupported" | "empty" | "failed") {
    super(message);
    this.name = "BrokerDataUnavailable";
  }
}

const TIMEOUT_MS = 12_000;
const MAX_REQUESTS = 24; // per call: a long backtest is capped rather than hammering the broker

function headers(broker: BrokerId, ctx: LiveCtx): Record<string, string> {
  switch (broker) {
    case "groww":
      return { Authorization: `Bearer ${ctx.token}`, "X-API-VERSION": "1.0" };
    case "zerodha":
      return kiteHeaders(ctx);
    case "upstox":
      return upstoxHeaders(ctx);
    case "fyers":
      return fyersHeaders(ctx);
    case "angelone":
      return angelHeaders(ctx);
    case "dhan":
      return dhanHeaders(ctx);
    case "5paisa":
      return fpHeaders(ctx);
    default:
      return {};
  }
}

async function send(broker: BrokerId, ctx: LiveCtx, r: BrokerRequest): Promise<unknown> {
  let res: { status: number; text(): Promise<string> };
  try {
    res = await brokerFetch(r.url, {
      method: r.method,
      headers: { Accept: "application/json", ...(r.json !== undefined ? { "Content-Type": "application/json" } : {}), ...headers(broker, ctx) },
      body: r.json !== undefined ? JSON.stringify(r.json) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    throw new BrokerError("unreachable");
  }
  const raw = await res.text();
  let body: unknown = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    // gateway error page
  }
  const b = obj(body);
  const msg = brokerMessage(b) ?? text(b.message) ?? text(b.errorMessage) ?? undefined;
  if (res.status === 401 || res.status === 403) throw new BrokerError("session_rejected", msg ?? `answered ${res.status}`);
  if (res.status === 429) throw new BrokerError("rate_limited", msg);
  if (res.status >= 500) throw new BrokerError("unreachable", msg);
  if (res.status >= 400) throw new BrokerError("unknown", msg ?? `answered ${res.status}`);
  // Some brokers answer 200 with a failure inside.
  if (b.status === "FAILURE" || b.status === false || b.s === "error" || b.status === "error") throw new BrokerError("unknown", msg ?? "the broker refused the request");
  return body;
}

const DAY = 86400;
/** How far back a chart/backtest range reaches, in seconds before now. Short ranges over-fetch to span weekends and holidays. */
export function rangeStart(range: CandleRange, nowSec: number): number {
  const days: Record<CandleRange, number> = { "1d": 6, "5d": 10, "1mo": 31, "3mo": 92, "6mo": 183, ytd: 0, "1y": 366, "5y": 1827, max: 7300 };
  if (range === "ytd") {
    const y = new Date((nowSec + 19800) * 1000).getUTCFullYear();
    return Date.UTC(y, 0, 1) / 1000 - 19800;
  }
  return nowSec - days[range] * DAY;
}

/** "1d" means the latest trading day and "5d" the latest five, as Yahoo serves them. */
export function trimToTradingDays(candles: Candle[], range: CandleRange): Candle[] {
  const keep = range === "1d" ? 1 : range === "5d" ? 5 : 0;
  if (!keep) return candles;
  const days = [...new Set(candles.map((c) => istDayAndMinute(c.time).day))].slice(-keep);
  const first = days[0];
  return first === undefined ? candles : candles.filter((c) => istDayAndMinute(c.time).day >= first);
}

/** Weekly (Monday) or monthly buckets from daily candles, in IST. */
export function calendarResample(daily: Candle[], unit: "week" | "month"): Candle[] {
  const out: Candle[] = [];
  let key = "";
  for (const c of daily) {
    const d = new Date((c.time + 19800) * 1000);
    const k = unit === "month" ? `${d.getUTCFullYear()}-${d.getUTCMonth()}` : String(Math.floor((istDayAndMinute(c.time).day + 3) / 7)); // epoch day 0 was a Thursday
    const last = out[out.length - 1];
    if (k === key && last) {
      last.high = Math.max(last.high, c.high);
      last.low = Math.min(last.low, c.low);
      last.close = c.close;
      last.volume += c.volume;
    } else {
      key = k;
      out.push({ ...c });
    }
  }
  return out;
}

/** Which native interval to ask the broker for, and how to turn it into the one wanted. */
export function plan(source: BrokerCandleSource, interval: CandleInterval): { base: CandleInterval; build: (c: Candle[]) => Candle[] } | null {
  if (source.intervals[interval]) return { base: interval, build: (c) => c };
  const has = (i: CandleInterval) => !!source.intervals[i];
  if ((interval === "2m" || interval === "3m") && has("1m")) return { base: "1m", build: (c) => resampleCandles(c, fixedBucket(interval === "2m" ? 2 : 3)) };
  if (interval === "30m" && has("15m")) return { base: "15m", build: (c) => resampleCandles(c, fixedBucket(30)) };
  if (interval === "4h" && has("60m")) return { base: "60m", build: (c) => resampleCandles(c, fourHourBucket) };
  if ((interval === "1wk" || interval === "1mo") && has("1d")) return { base: "1d", build: (c) => calendarResample(c, interval === "1wk" ? "week" : "month") };
  return null;
}

const dedupe = (candles: Candle[]) => {
  const byTime = new Map<number, Candle>();
  for (const c of candles) byTime.set(c.time, c);
  return [...byTime.values()].sort((a, b) => a.time - b.time);
};

/** Candles for one NSE stock from one broker, using the user's session. */
export async function brokerCandles(broker: BrokerId, ctx: LiveCtx, symbol: string, range: CandleRange, interval: CandleInterval, nowSec = Math.floor(Date.now() / 1000)): Promise<Candle[]> {
  const source = CANDLE_SOURCES[broker];
  const name = brokerById(broker)?.name ?? broker;
  if (!source) throw new BrokerDataUnavailable(NO_CANDLES_REASON[broker] ?? `${name} doesn't supply market data here yet.`, "no_source");
  const m = /^([A-Z0-9&-]+)\.NS$/.exec(symbol.toUpperCase());
  if (!m) throw new BrokerDataUnavailable(`${symbol} isn't an NSE stock, so it comes from the general feed.`, "unsupported");
  const eq = await nseEquity(m[1]);
  if (!eq) throw new BrokerDataUnavailable(`${m[1]} isn't in NSE's current equity list.`, "unsupported");
  const p = plan(source, interval);
  if (!p) throw new BrokerDataUnavailable(`${name} doesn't supply ${interval} candles.`, "unsupported");
  const spec = source.intervals[p.base]!;
  const intraday = !["1d", "1wk", "1mo"].includes(p.base);
  let from = rangeStart(range, nowSec);
  if (intraday) from = Math.max(from, nowSec - source.intradayHistoryDays * DAY);
  let reqs = source.request(eq, spec, p.base, from, nowSec);
  if (reqs.length > MAX_REQUESTS) reqs = reqs.slice(-MAX_REQUESTS); // keep the most recent windows
  const all: Candle[] = [];
  for (const r of reqs) {
    try {
      all.push(...source.parse(await send(broker, ctx, r)));
    } catch (err) {
      if (err instanceof BrokerError && err.failure.code === "session_rejected") throw new BrokerDataUnavailable(`${name} refused market data for this account${err.failure.detail ? ` (“${err.failure.detail}”)` : ""} — usually because its API plan doesn't include data.`, "no_access");
      throw err;
    }
  }
  const candles = trimToTradingDays(p.build(dedupe(all)), range);
  if (!candles.length) throw new BrokerDataUnavailable(`${name} returned no prices for ${m[1]}.`, "empty");
  return candles;
}

/** A market-data provider reading from this user's own broker. */
export function brokerMarketData(userId: string, broker: BrokerId): MarketDataProvider {
  const name = brokerById(broker)?.name ?? broker;
  return {
    name: `${name} (your broker account)`,
    isOfficial: true,
    depth: "extended",
    async getHistoricalCandles(symbol, range, interval) {
      const { session } = await import("@/lib/live/orders"); // loaded late: orders.ts imports market data itself
      let ctx: LiveCtx;
      try {
        ctx = await session(userId, broker);
      } catch (err) {
        throw new BrokerDataUnavailable(err instanceof Error ? err.message : `Log in to ${name} for today first.`, "logged_out");
      }
      return brokerCandles(broker, ctx, symbol, range, interval);
    },
  };
}

export { CANDLE_SOURCES, NO_CANDLES_REASON };

/** One request to the user's broker with their session (shared by the option-chain adapters). */
export const brokerSend = send;
