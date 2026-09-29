import { parseBarsCsv, toTrueDataTime, type TrueDataProvider } from "./providers/truedata";
import type { Candle } from "./types";

// Everything the licensed feed offers beyond candles: market movers, breadth,
// index members, 52-week range, corporate actions and option chains with
// Greeks. Reached only through marketExtrasFor() in index.ts, which returns
// null for anyone not allowed the licensed feed.

/** CSV (with a header row) → one record per line, keyed by lower-cased column name. */
export function csvRecords(body: string): Record<string, string>[] {
  const text = body.replace(/^﻿/, "").trim();
  if (!text || /no data exists|not subscribed/i.test(text) || text.startsWith("{")) return [];
  const [head, ...rows] = text.split(/\r?\n/);
  const cols = head.split(",").map((c) => c.trim().toLowerCase());
  return rows.map((line) => {
    const f = line.split(",");
    return Object.fromEntries(cols.map((c, i) => [c, (f[i] ?? "").trim()]));
  });
}

const num = (s: string | undefined) => (s === undefined || s === "" ? null : Number.isFinite(Number(s)) ? Number(s) : null);
/** "29-09-2026 15:15:11" / "9/29/2026 12:00:00 AM" / "2026-09-29" → "2026-09-29". */
export function isoDate(s: string): string | null {
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{2})-(\d{2})-(\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return null;
}

export type Mover = { symbol: string; close: number; prevClose: number | null; change: number | null; changePct: number; volume: number | null; turnover: number | null };
export type Active = { symbol: string; ltp: number; prevClose: number | null; changePct: number | null; volume: number | null; turnover: number | null };
export type Breadth = { advances: number; declines: number; total: number };
export type CorpAction = { purpose: string; exDate: string | null; recordDate: string | null };

export type OptionSide = {
  ltp: number | null;
  prevClose: number | null;
  bid: number | null;
  ask: number | null;
  volume: number | null;
  oi: number | null;
  prevOi: number | null;
  iv: number | null;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
};
export type ChainRow = { strike: number; call: OptionSide; put: OptionSide };

export function parseMovers(body: string): Mover[] {
  return csvRecords(body)
    .filter((r) => r.series === "EQ" && r.exchange === "NSE")
    .map((r) => ({
      symbol: `${r.symbol}.NS`,
      close: num(r.dclose) ?? 0,
      prevClose: num(r.pclose),
      change: num(r.change),
      changePct: num(r.changeper) ?? 0,
      volume: num(r.volume),
      turnover: num(r.turnover),
    }))
    .filter((m) => m.close > 0);
}

export function parseActive(body: string): Active[] {
  return csvRecords(body)
    .filter((r) => r.series === "EQ")
    .map((r) => {
      const ltp = num(r.ltp) ?? 0;
      const pc = num(r.pclose);
      return { symbol: `${r.symbol}.NS`, ltp, prevClose: pc, changePct: pc ? ((ltp - pc) / pc) * 100 : null, volume: num(r.totvol), turnover: num(r.tto) };
    })
    .filter((a) => a.ltp > 0);
}

/** getMarketAdvDec replies "adv_dec_tot" then advances, declines, total on separate lines. */
export function parseBreadth(body: string): Breadth | null {
  const n = body.trim().split(/\r?\n/).slice(1).map(Number);
  return n.length >= 3 && n.every(Number.isFinite) ? { advances: n[0], declines: n[1], total: n[2] } : null;
}

export function parseChain(body: string): ChainRow[] {
  const side = (r: Record<string, string>, p: "call" | "put") => {
    const c = p === "call";
    return {
      ltp: num(c ? r.callltp : r.putltp) || null,
      prevClose: num(c ? r.callpclose : r.putpclose),
      bid: num(c ? r.callbid : r.putbid) || null,
      ask: num(c ? r.callask : r.putask) || null,
      volume: num(c ? r.callvol : r.putvol),
      oi: num(c ? r.calloi : r.putoi),
      prevOi: num(c ? r.callpoi : r.putpoi),
      iv: num(c ? r.civ : r.piv),
      delta: num(c ? r.cdelta : r.pdelta),
      gamma: num(c ? r.cgamma : r.pgamma),
      theta: num(c ? r.ctheta : r.ptheta),
      vega: num(c ? r.cvega : r.pvega),
    };
  };
  return csvRecords(body)
    .map((r) => ({ strike: num(r.strike) ?? NaN, call: side(r, "call"), put: side(r, "put") }))
    .filter((r) => Number.isFinite(r.strike))
    .sort((a, b) => a.strike - b.strike);
}

/** Put-call ratio by open interest. */
export function pcr(rows: ChainRow[]): number | null {
  const c = rows.reduce((s, r) => s + (r.call.oi ?? 0), 0);
  const p = rows.reduce((s, r) => s + (r.put.oi ?? 0), 0);
  return c > 0 ? p / c : null;
}

/** The strike where option writers lose least at expiry (sum of intrinsic value × OI is lowest). */
export function maxPain(rows: ChainRow[]): number | null {
  let best: { strike: number; pain: number } | null = null;
  for (const k of rows) {
    let pain = 0;
    for (const r of rows) {
      pain += Math.max(0, k.strike - r.strike) * (r.call.oi ?? 0);
      pain += Math.max(0, r.strike - k.strike) * (r.put.oi ?? 0);
    }
    if (!best || pain < best.pain) best = { strike: k.strike, pain };
  }
  return best?.strike ?? null;
}

/** "RELIANCE.NS" → "RELIANCE"; "^NSEI" → "NIFTY 50" etc. — the TrueData name used by these endpoints. */
const INDEX_NAMES: Record<string, string> = { "^NSEI": "NIFTY 50", "^NSEBANK": "NIFTY BANK", "^CNXIT": "NIFTY IT", "^BSESN": "SENSEX" };
export const tdName = (symbol: string) => INDEX_NAMES[symbol] ?? symbol.replace(/\.NS$/, "");

/** Option underlyings: an index's F&O name ("^NSEI" → "NIFTY") or the stock symbol. */
const FNO_INDEX: Record<string, string> = { "^NSEI": "NIFTY", "^NSEBANK": "BANKNIFTY" };
export const optionUnderlying = (symbol: string) => FNO_INDEX[symbol] ?? symbol.replace(/\.NS$/, "");

export class MarketExtras {
  constructor(private readonly td: TrueDataProvider) {}

  async movers(kind: "gainers" | "losers" | "volume", top = 10): Promise<Mover[]> {
    const path = kind === "gainers" ? "gettopngainers" : kind === "losers" ? "gettopnlosers" : "gettopnvolumegainers";
    return parseMovers(await this.td.request("history", path, { segment: "NSEEQ", response: "csv", topn: String(Math.max(top * 3, 30)) }, 30)).slice(0, top);
  }

  /** Today's change for every traded NSE stock (gainers + losers lists together), keyed by symbol. */
  async dayChanges(): Promise<Map<string, Mover>> {
    const [up, down] = await Promise.all([
      this.td.request("history", "gettopngainers", { segment: "NSEEQ", response: "csv", topn: "5000" }, 60),
      this.td.request("history", "gettopnlosers", { segment: "NSEEQ", response: "csv", topn: "5000" }, 60),
    ]);
    return new Map([...parseMovers(up), ...parseMovers(down)].map((m) => [m.symbol, m]));
  }

  async mostActive(by: "volume" | "turnover", top = 10, indexName = "all"): Promise<Active[]> {
    const path = by === "volume" ? "getMostActiveByVolume" : "getMostActiveByTurnover";
    return parseActive(await this.td.request("analytics", path, { top: String(top * 2), segment: "eq", response: "csv", exchange: "NSE", indexName }, 30)).slice(0, top);
  }

  async breadth(indexName: string): Promise<Breadth | null> {
    return parseBreadth(await this.td.request("analytics", "getMarketAdvDec", { indexName }, 30));
  }

  async circuits(which: "upper" | "lower", top = 10): Promise<Active[]> {
    const path = which === "upper" ? "getStocksInUpperCircuit" : "getStocksInLowerCircuit";
    return parseActive(await this.td.request("analytics", path, { top: String(top * 2), response: "csv", exchange: "NSE" }, 60)).slice(0, top);
  }

  async indexMembers(indexName: string): Promise<{ symbol: string; industry: string }[]> {
    return csvRecords(await this.td.request("history", "getindexcomponents", { response: "csv", indexname: indexName }, 86400)).map((r) => ({ symbol: `${r.symbol}.NS`, industry: r.industry || "Other" }));
  }

  async week52(symbol: string): Promise<{ high: number; low: number } | null> {
    const r = csvRecords(await this.td.request("history", "get52WeekHL", { symbol: tdName(symbol), response: "csv" }, 3600))[0];
    const high = num(r?.["52weekhigh"]), low = num(r?.["52weeklow"]);
    return high && low ? { high, low } : null;
  }

  async corporateActions(symbol: string): Promise<CorpAction[]> {
    return csvRecords(await this.td.request("history", "getcorpaction", { symbol: tdName(symbol), response: "csv" }, 86400))
      .map((r) => ({ purpose: r.purpose, exDate: isoDate(r.ex_date), recordDate: r.record_date?.startsWith("1970") ? null : isoDate(r.record_date) }))
      .filter((a) => a.purpose)
      .sort((a, b) => (b.exDate ?? "").localeCompare(a.exDate ?? ""));
  }

  /**
   * Raw candles for any TrueData symbol (option contracts included) over at most
   * ~14 days. Past windows never change, so they're cached for a week.
   */
  async bars(tdSymbol: string, from: number, to: number, interval: "1min" | "5min" | "eod"): Promise<Candle[]> {
    const past = to < Date.now() / 1000 - 86400;
    const body = await this.td.request("history", "getbars", { symbol: tdSymbol, from: toTrueDataTime(from), to: toTrueDataTime(to), interval, response: "csv" }, past ? 7 * 86400 : 30);
    return parseBarsCsv(body, interval === "eod");
  }

  /** Every F&O contract that traded on a date (yyyy-mm-dd) — how past expiries and strikes are found. */
  async tradedFoSymbols(date: string): Promise<string[]> {
    const body = await this.td.request("history", "gettradedsymbols", { segment: "FO", date, response: "csv" }, 7 * 86400);
    return csvRecords(body).map((r) => r.symbol).filter(Boolean);
  }

  /** Contract lot size for an option underlying, from the F&O symbol master. */
  async lotSize(underlying: string): Promise<number | null> {
    const rows = csvRecords(await this.td.masterRequest("getAllSymbols", { segment: "fo", search: underlying, csv: "true", csvHeader: "true", limit: "20" }));
    const re = new RegExp(`^${underlying.replace(/[^A-Z0-9&-]/gi, "")}\\d`);
    const hit = rows.find((r) => re.test(r.symbol) && Number(r.lotsize) > 0);
    return hit ? Number(hit.lotsize) : null;
  }

  /** Upcoming expiry dates (yyyy-mm-dd) for an option underlying ("NIFTY", "RELIANCE"). */
  async expiries(underlying: string, opts: { includeToday?: boolean } = {}): Promise<string[]> {
    const ist = new Date(Date.now() + 5.5 * 3_600_000);
    const today = ist.toISOString().slice(0, 10);
    // An expiry day's contracts stop trading at 15:30 IST.
    const afterClose = ist.getUTCHours() * 60 + ist.getUTCMinutes() >= 15 * 60 + 30;
    return csvRecords(await this.td.request("history", "getSymbolExpiryList", { symbol: underlying, response: "csv" }, 3600))
      .map((r) => isoDate(r.expiry))
      .filter((d): d is string => !!d && (d > today || (d === today && (!afterClose || !!opts.includeToday))));
  }

  /** The full option chain for one expiry, with IV and Greeks. */
  async optionChain(underlying: string, expiry: string): Promise<ChainRow[]> {
    const [y, m, d] = expiry.split("-");
    return parseChain(await this.td.request("greeks", "getOptionChainwithGreeks", { symbol: underlying, expiry: `${d}-${m}-${y}`, response: "csv" }, 5));
  }
}
