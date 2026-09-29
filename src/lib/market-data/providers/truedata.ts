import { logWarn } from "@/lib/logger";
import type { Candle, CandleInterval, CandleRange, MarketDataProvider, Tick } from "../types";

// TrueData history over REST (auth.truedata.in → history.truedata.in).
// Credentials come only from MARKET_DATA_TRUEDATA_USER / _PASSWORD; the
// provider is built only when both are set, and index.ts hands it only to
// allow-listed accounts. Timestamps come back as IST wall-clock strings.

const AUTH_URL = "https://auth.truedata.in/token";
const HISTORY_URL = "https://history.truedata.in";
const IST_OFFSET_SECONDS = 5.5 * 3600;
const SESSION_OPEN = 9 * 60 + 15;
const SESSION_CLOSE = 15 * 60 + 30;
const TIMEOUT_MS = 15_000;
// Docs allow 10 bar requests/second; measured 8 parallel requests all succeed. Space starts ~8/s.
const MIN_GAP_MS = 125;
// Each getbars reply holds only the LAST ~15 days (intraday) or ~3 years (eod) of the asked window,
// though older data exists — so longer ranges are fetched in windows no longer than these.
const INTRADAY_WINDOW_S = 14 * 86400;
const EOD_WINDOW_S = 1000 * 86400;
const MAX_ATTEMPTS = 4;
const RETRY_DELAY_MS = 1_000;

const INDEX_SYMBOLS: Record<string, string> = {
  "^NSEI": "NIFTY 50",
  "^NSEBANK": "NIFTY BANK",
  "^CNXIT": "NIFTY IT",
  "^CNXFIN": "NIFTY FIN SERVICE",
  "^BSESN": "SENSEX",
};

/** Our (Yahoo-style) symbol → TrueData's, or null when TrueData can't serve it (e.g. BSE numeric codes, foreign tickers). */
export function toTrueDataSymbol(symbol: string): string | null {
  const s = symbol.trim().toUpperCase();
  if (INDEX_SYMBOLS[s]) return INDEX_SYMBOLS[s];
  const m = /^([A-Z0-9&-]+)\.NS$/.exec(s);
  return m ? m[1] : null;
}

const BAR_INTERVAL: Partial<Record<CandleInterval, string>> = {
  "1m": "1min",
  "2m": "2min",
  "3m": "3min",
  "5m": "5min",
  "15m": "15min",
  "30m": "30min",
  "60m": "60min",
  "1d": "eod",
  "1wk": "eod",
  "1mo": "eod",
};

/** yymmddTHH:mm:ss in IST, the format TrueData's from/to take. */
export function toTrueDataTime(unixSeconds: number): string {
  const d = new Date((unixSeconds + IST_OFFSET_SECONDS) * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCFullYear() % 100)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

/** Start of the requested window. 1d/5d reach back further and are trimmed to trading days afterwards (weekends, holidays). */
export function rangeStart(range: CandleRange, now: number): number {
  const d = new Date((now + IST_OFFSET_SECONDS) * 1000);
  const back = (months: number, years = 0) => {
    const x = new Date(d);
    x.setUTCFullYear(x.getUTCFullYear() - years, x.getUTCMonth() - months);
    return Math.floor(x.getTime() / 1000) - IST_OFFSET_SECONDS;
  };
  switch (range) {
    case "1d": return now - 7 * 86400;
    case "5d": return now - 14 * 86400;
    case "1mo": return back(1);
    case "3mo": return back(3);
    case "6mo": return back(6);
    case "ytd": return Date.UTC(d.getUTCFullYear(), 0, 1) / 1000 - IST_OFFSET_SECONDS;
    case "1y": return back(0, 1);
    case "5y": return back(0, 5);
    case "max": return Date.UTC(2000, 0, 1) / 1000 - IST_OFFSET_SECONDS;
  }
}

/**
 * Splits [from, to] into windows of `size` seconds aligned to fixed IST-day
 * boundaries, so a past window always has the same from/to — and so the same
 * URL, which lets its (unchanging) reply be cached. Only the last window, which
 * ends now, is fetched fresh.
 */
export function windows(from: number, to: number, size: number): [number, number][] {
  const out: [number, number][] = [];
  const dayStart = (t: number) => Math.floor((t + IST_OFFSET_SECONDS) / 86400) * 86400 - IST_OFFSET_SECONDS;
  const base = dayStart(0);
  let start = base + Math.floor((dayStart(from) - base) / size) * size;
  for (; start <= to; start += size) out.push([start, Math.min(start + size - 1, to)]);
  return out;
}

const istDay = (t: number) => Math.floor((t + IST_OFFSET_SECONDS) / 86400);
const istMinute = (t: number) => Math.floor(((t + IST_OFFSET_SECONDS) % 86400) / 60);

/** "2021-02-01T09:15" / "2021-02-01T09:15:00" / "2021-02-01" (IST) → unix seconds. */
function parseIstTimestamp(raw: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(raw.trim());
  if (!m) return null;
  const [, y, mo, da, h = "0", mi = "0", s = "0"] = m;
  return Date.UTC(+y, +mo - 1, +da, +h, +mi, +s) / 1000 - IST_OFFSET_SECONDS;
}

/**
 * Parses a getbars CSV by its header (the docs disagree on column order).
 * Returns [] for TrueData's "No data exists" reply; throws on any other non-CSV reply.
 */
export function parseBarsCsv(body: string, daily: boolean): Candle[] {
  const text = body.replace(/^﻿/, "").trim();
  if (!text || /no data exists/i.test(text)) return [];
  const lines = text.split(/\r?\n/);
  const header = lines[0].toLowerCase().split(",").map((h) => h.trim());
  const col = (name: string) => header.indexOf(name);
  const [ti, oi, hi, li, ci, vi] = ["timestamp", "open", "high", "low", "close", "volume"].map(col);
  if (ti < 0 || oi < 0 || hi < 0 || li < 0 || ci < 0) throw new Error(`TrueData: ${text.slice(0, 160)}`);

  const out: Candle[] = [];
  for (const line of lines.slice(1)) {
    const f = line.split(",");
    let time = parseIstTimestamp(f[ti] ?? "");
    const [open, high, low, close] = [f[oi], f[hi], f[li], f[ci]].map(Number);
    if (time == null || ![open, high, low, close].every(Number.isFinite)) continue;
    // Daily candles are stamped at the 09:15 IST open, the way the rest of the app (and Yahoo) stamps them.
    if (daily) time = istDay(time) * 86400 + SESSION_OPEN * 60 - IST_OFFSET_SECONDS;
    out.push({ time, open, high, low, close, volume: vi >= 0 ? Number(f[vi]) || 0 : 0 });
  }
  return out.sort((a, b) => a.time - b.time);
}

/** Parses a getlastnticks/getticks CSV (with bid/ask columns when asked for) into ticks, oldest first. */
export function parseTicksCsv(body: string): Tick[] {
  const text = body.replace(/^\uFEFF/, "").trim();
  if (!text || /no data exists/i.test(text)) return [];
  const lines = text.split(/\r?\n/);
  const header = lines[0].toLowerCase().split(",").map((h) => h.trim());
  const col = (name: string) => header.indexOf(name);
  const [ti, pi, vi, bi, bqi, ai, aqi] = ["timestamp", "ltp", "volume", "bid", "bidqty", "ask", "askqty"].map(col);
  if (ti < 0 || pi < 0) throw new Error(`TrueData: ${text.slice(0, 160)}`);
  const num = (f: string[], i: number) => (i >= 0 && f[i] !== undefined && f[i] !== "" && Number(f[i]) > 0 ? Number(f[i]) : null);
  const out: Tick[] = [];
  for (const line of lines.slice(1)) {
    const f = line.split(",");
    const time = parseIstTimestamp(f[ti] ?? "");
    const price = Number(f[pi]);
    if (time == null || !(price > 0)) continue;
    out.push({ time, price, volume: vi >= 0 ? Number(f[vi]) || 0 : 0, bid: num(f, bi), ask: num(f, ai), bidQty: num(f, bqi), askQty: num(f, aqi) });
  }
  return out.sort((a, b) => a.time - b.time);
}

/** Drops pre-open (09:00–09:15) and post-close bars so intraday candles match the normal session. */
export function sessionOnly(candles: Candle[]): Candle[] {
  return candles.filter((c) => {
    const m = istMinute(c.time);
    return m >= SESSION_OPEN && m < SESSION_CLOSE;
  });
}

/** Keeps the candles of the last `days` trading days present in the data. */
export function lastTradingDays(candles: Candle[], days: number): Candle[] {
  const keep = new Set([...new Set(candles.map((c) => istDay(c.time)))].slice(-days));
  return candles.filter((c) => keep.has(istDay(c.time)));
}

/** Weekly (Monday-start) or monthly candles from daily ones, stamped at the first day's time. */
export function groupDaily(candles: Candle[], by: "week" | "month"): Candle[] {
  const keyOf = (t: number) => {
    const day = istDay(t);
    if (by === "week") return day - ((day + 3) % 7); // day 0 (1970-01-01) was a Thursday
    const d = new Date(day * 86400 * 1000);
    return d.getUTCFullYear() * 12 + d.getUTCMonth();
  };
  const out: Candle[] = [];
  let key: number | null = null;
  for (const c of candles) {
    const k = keyOf(c.time);
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

type Token = { value: string; expiresAt: number };

export class TrueDataProvider implements MarketDataProvider {
  readonly name = "TrueData";
  readonly isOfficial = true;
  readonly depth = "extended" as const;
  private token: Token | null = null;
  private tokenPromise: Promise<string> | null = null;
  private gate: Promise<void> = Promise.resolve();

  constructor(private readonly user: string, private readonly password: string) {}

  static fromEnv(): TrueDataProvider | null {
    const user = process.env.MARKET_DATA_TRUEDATA_USER?.trim();
    const password = process.env.MARKET_DATA_TRUEDATA_PASSWORD?.trim();
    return user && password ? new TrueDataProvider(user, password) : null;
  }

  private async login(): Promise<string> {
    const res = await fetch(AUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ username: this.user, password: this.password, grant_type: "password" }).toString(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    const data = (await res.json().catch(() => null)) as { access_token?: string; expires_in?: number; error_description?: string } | null;
    if (!res.ok || !data?.access_token) throw new Error(`TrueData login failed: ${data?.error_description ?? res.status}`);
    // Tokens last ≤ 3600 s per the docs (and all reset ~04:00 IST) — renew a minute early.
    const ttl = Math.min(data.expires_in ?? 3600, 3600) - 60;
    this.token = { value: data.access_token, expiresAt: Date.now() + ttl * 1000 };
    return data.access_token;
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now()) return this.token.value;
    this.tokenPromise ??= this.login().finally(() => (this.tokenPromise = null));
    return this.tokenPromise;
  }

  /** Spaces requests out so a burst (e.g. a page with several charts) doesn't trip the per-second quota. */
  private async slot(): Promise<void> {
    const prev = this.gate;
    let release!: () => void;
    this.gate = new Promise((r) => (release = r));
    await prev;
    setTimeout(release, MIN_GAP_MS);
  }

  /**
   * GET a TrueData REST endpoint with the bearer token: spaced out, retried on
   * network errors / auth expiry / quota / 5xx, and cached for `revalidate`
   * seconds (0 = never cached).
   */
  async request(base: "history" | "analytics" | "greeks", path: string, params: Record<string, string>, revalidate = 60): Promise<string> {
    const host = base === "history" ? HISTORY_URL : base === "analytics" ? "https://analytics.truedata.in/api" : "https://greeks.truedata.in/api";
    const url = `${host}/${path}?${new URLSearchParams(params)}`;
    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      if (attempt > 1) await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt - 1)));
      await this.slot();
      let res: Response;
      let body: string;
      try {
        res = await fetch(url, {
          headers: { Authorization: `Bearer ${await this.accessToken()}` },
          signal: AbortSignal.timeout(TIMEOUT_MS),
          ...(revalidate > 0 ? { next: { revalidate } } : { cache: "no-store" as const }),
        });
        body = await res.text();
      } catch (err) {
        // Network error, timeout or a failed login — all worth another try.
        lastError = err;
        logWarn("truedata", "request failed, retrying", { attempt, path, symbol: params.symbol, error: String(err) });
        continue;
      }
      const denied = res.status === 401 || /authorization has been denied/i.test(body);
      const quota = res.status === 429 || /quota exceeded/i.test(body);
      if (denied || quota || res.status >= 500) {
        if (denied) this.token = null;
        lastError = new Error(`TrueData request failed: ${res.status} ${body.slice(0, 120)}`);
        logWarn("truedata", "request rejected, retrying", { attempt, path, symbol: params.symbol, status: res.status });
        continue;
      }
      if (!res.ok) throw new Error(`TrueData request failed: ${res.status} ${body.slice(0, 120)}`);
      return body;
    }
    throw lastError instanceof Error ? lastError : new Error("TrueData request failed");
  }

  async getRecentTicks(symbol: string, count: number): Promise<Tick[]> {
    const tdSymbol = toTrueDataSymbol(symbol);
    if (!tdSymbol) throw new Error(`${symbol} isn't available on TrueData yet (NSE stocks and main indices only)`);
    const n = String(Math.min(Math.max(Math.round(count), 1), 500));
    return parseTicksCsv(await this.request("history", "getlastnticks", { symbol: tdSymbol, bidask: "1", response: "csv", nticks: n, interval: "tick" }, 0));
  }

  async getHistoricalCandles(symbol: string, range: CandleRange, interval: CandleInterval): Promise<Candle[]> {
    const tdSymbol = toTrueDataSymbol(symbol);
    const tdInterval = BAR_INTERVAL[interval];
    if (!tdSymbol) throw new Error(`${symbol} isn't available on TrueData yet (NSE stocks and main indices only)`);
    if (!tdInterval) throw new Error(`TrueData doesn't offer ${interval} candles`);

    const now = Math.floor(Date.now() / 1000);
    const daily = tdInterval === "eod";
    const from = rangeStart(range, now);
    const parts = await Promise.all(
      windows(from, now, daily ? EOD_WINDOW_S : INTRADAY_WINDOW_S).map(async ([from, to]) =>
        parseBarsCsv(
          await this.request(
            "history",
            "getbars",
            { symbol: tdSymbol, from: toTrueDataTime(from), to: toTrueDataTime(to), interval: tdInterval, response: "csv" },
            // A window that ended before today never changes: keep it a day. Today's is refreshed every 30 s.
            to < now - 86400 ? 86400 : 30,
          ),
          daily,
        ),
      ),
    );
    // Windows can share an edge candle — keep one per timestamp.
    const byTime = new Map<number, Candle>();
    for (const c of parts.flat()) byTime.set(c.time, c);

    // Aligned windows can start before the range does — trim back to it.
    let candles = [...byTime.values()].filter((c) => c.time >= from - 86400).sort((a, b) => a.time - b.time);
    if (!daily) candles = sessionOnly(candles);
    if (range === "1d") candles = lastTradingDays(candles, 1);
    else if (range === "5d") candles = lastTradingDays(candles, 5);
    if (interval === "1wk") candles = groupDaily(candles, "week");
    if (interval === "1mo") candles = groupDaily(candles, "month");
    if (candles.length === 0) logWarn("truedata", "no candles", { symbol: tdSymbol, range, interval });
    return candles;
  }
}
