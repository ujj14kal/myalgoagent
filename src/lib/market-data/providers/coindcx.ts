import { fetchJsonWithRetry } from "@/lib/fetch-json-with-retry";
import { bucketCandles, coindcxPair, isCryptoSymbol } from "../crypto";
import type { Candle, CandleInterval, CandleRange, MarketDataProvider } from "../types";

// CoinDCX's public market-data API (no key needed): candles for every INR pair, newest first, up to 1,000 a request.
// Crypto never closes, so there is no session, no holiday and no "market window" here.

const BASE = "https://public.coindcx.com/market_data/candles";
const PAGE = 1000;
const MAX_PAGES = 45;

/**
 * CoinDCX serves only 1m, 15m, 1h and 1d candles. Every other timeframe is built from those, on a UTC grid (candles open on
 * the hour, at 00:00 UTC for days, on Monday for weeks, on the 1st for months).
 */
const SOURCE: Partial<Record<CandleInterval, { name: "1m" | "15m" | "1h" | "1d"; seconds: number; bucket?: (t: number) => number }>> = {
  "1m": { name: "1m", seconds: 60 },
  "2m": { name: "1m", seconds: 60, bucket: (t) => Math.floor(t / 120) * 120 },
  "3m": { name: "1m", seconds: 60, bucket: (t) => Math.floor(t / 180) * 180 },
  "5m": { name: "1m", seconds: 60, bucket: (t) => Math.floor(t / 300) * 300 },
  "15m": { name: "15m", seconds: 900 },
  "30m": { name: "15m", seconds: 900, bucket: (t) => Math.floor(t / 1800) * 1800 },
  "60m": { name: "1h", seconds: 3600 },
  "4h": { name: "1h", seconds: 3600, bucket: (t) => Math.floor(t / 14400) * 14400 },
  "1d": { name: "1d", seconds: 86400 },
  "1wk": { name: "1d", seconds: 86400, bucket: (t) => Math.floor((t - 4 * 86400) / 604800) * 604800 + 4 * 86400 },
  "1mo": { name: "1d", seconds: 86400, bucket: (t) => Math.floor(Date.UTC(new Date(t * 1000).getUTCFullYear(), new Date(t * 1000).getUTCMonth(), 1) / 1000) },
};

const RANGE_SECONDS: Record<Exclude<CandleRange, "ytd">, number> = {
  "1d": 86400,
  "5d": 5 * 86400,
  "1mo": 30 * 86400,
  "3mo": 91 * 86400,
  "6mo": 182 * 86400,
  "1y": 365 * 86400,
  "5y": 1826 * 86400,
  max: 3650 * 86400,
};

type Row = { open: number; high: number; low: number; close: number; volume: number; time: number };

export function rangeStartSeconds(range: CandleRange, now: number): number {
  if (range === "ytd") return Math.floor(Date.UTC(new Date(now * 1000).getUTCFullYear(), 0, 1) / 1000);
  return now - RANGE_SECONDS[range];
}

export class CoinDcxProvider implements MarketDataProvider {
  readonly name = "CoinDCX";
  readonly isOfficial = true; // the exchange's own prices
  readonly depth = "standard" as const;

  async getHistoricalCandles(symbol: string, range: CandleRange, interval: CandleInterval): Promise<Candle[]> {
    if (!isCryptoSymbol(symbol)) throw new Error(`"${symbol}" is not a crypto pair.`);
    const step = SOURCE[interval];
    if (!step) throw new Error(`No ${interval} crypto candles.`);
    const pair = coindcxPair(symbol);
    const now = Math.floor(Date.now() / 1000);
    const from = rangeStartSeconds(range, now);
    const out = new Map<number, Candle>();
    let end = (now + step.seconds) * 1000;
    for (let page = 0; page < MAX_PAGES; page++) {
      const url = `${BASE}?pair=${encodeURIComponent(pair)}&interval=${step.name}&limit=${PAGE}&startTime=${from * 1000}&endTime=${end}`;
      const res = await fetchJsonWithRetry<Row[]>(url, { headers: { Accept: "application/json" }, cache: "no-store" }, { timeoutMs: 15_000, maxAttempts: 3 });
      if (!res.ok || !Array.isArray(res.data)) throw new Error(`CoinDCX candles request failed (${res.status}).`);
      const rows = res.data;
      for (const r of rows) {
        const time = Math.floor(r.time / 1000);
        if (time >= from && [r.open, r.high, r.low, r.close].every((n) => Number.isFinite(n) && n > 0)) {
          out.set(time, { time, open: r.open, high: r.high, low: r.low, close: r.close, volume: Number.isFinite(r.volume) ? r.volume : 0 });
        }
      }
      if (rows.length < PAGE) break;
      const oldest = Math.min(...rows.map((r) => r.time));
      if (oldest / 1000 <= from) break;
      end = oldest - 1;
    }
    if (out.size === 0) throw new Error(`No data returned for ${symbol}.`);
    const sorted = [...out.values()].sort((a, b) => a.time - b.time);
    return step.bucket ? bucketCandles(sorted, step.bucket) : sorted;
  }
}
