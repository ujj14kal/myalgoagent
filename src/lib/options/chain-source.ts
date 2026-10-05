import "server-only";
import { prisma } from "@/lib/prisma";
import { brokerById } from "@/lib/brokers/catalog";
import { brokerSend } from "@/lib/brokers/broker-data";
import { BrokerError } from "@/lib/brokers/adapters";
import { describeFailure } from "@/lib/brokers/failures";
import { nseEquity } from "@/lib/brokers/nse-lookup";
import { optionContracts as growwContracts, optionUnderlyings as growwUnderlyings, type OptionContracts } from "@/lib/brokers/groww-fno";
import { cached } from "@/lib/jobs";
import type { Prisma } from "@prisma/client";
import { marketDataFor, marketExtrasFor } from "@/lib/market-data";
import type { LiveCtx } from "@/lib/brokers/live-brokers";
import { logError } from "@/lib/logger";
import {
  CHAIN_BROKERS,
  dhanChainRequest,
  dhanExpiriesRequest,
  dhanUnderlying,
  growwChainRequest,
  parseDhanChain,
  parseDhanExpiries,
  parseGrowwChain,
  parseUpstoxChain,
  parseUpstoxContracts,
  upstoxChainRequest,
  upstoxContractsRequest,
  upstoxUnderlyingKey,
  type ChainBroker,
  type ParsedChain,
} from "./broker-chains";
import { enrichChain, historicalVol, type ChainSourceInfo, type OptionChain, type RawChain, type RawSide } from "./chain";

// Where a user's option chain comes from, in order:
//  1. their own connected broker (Groww, Upstox, Dhan), through their own session;
//  2. the licensed feed — only for the accounts allowed it;
//  3. a free-trial estimate: the exchange's real contracts (expiries, strikes, lot sizes from
//     Groww's public instrument list) priced by us from the underlying's price — labelled as estimates.

export type BrokerIssue = { broker: string; name: string; reason: string };
export type LoadedChain = { chain: OptionChain; expiries: string[]; brokerIssues: BrokerIssue[] };

/** Option underlyings → the instrument whose price is the spot in our own data. */
const SPOT_SYMBOL: Record<string, string> = { NIFTY: "^NSEI", BANKNIFTY: "^NSEBANK" };
export const spotSymbolOf = (u: string) => SPOT_SYMBOL[u] ?? `${u}.NS`;

/** "nifty 50" / "Nifty Bank" / "reliance.ns" → the F&O underlying name. */
export function normaliseUnderlying(raw: string): string {
  const u = raw.trim().toUpperCase().replace(/\.NS$/, "");
  return ({ "NIFTY 50": "NIFTY", NIFTY50: "NIFTY", "^NSEI": "NIFTY", "NIFTY BANK": "BANKNIFTY", "BANK NIFTY": "BANKNIFTY", "^NSEBANK": "BANKNIFTY" } as Record<string, string>)[u] ?? u;
}

// The exchange's contract lists change once a day; parsing Groww's full instrument file takes ~10 s,
// so the per-underlying result is shared through the database cache (and memory) for 6 hours.
const SIX_HOURS = 6 * 3_600_000;
const contractMemo = new Map<string, { at: number; value: Promise<OptionContracts> }>();
function optionContracts(underlying: string): Promise<OptionContracts> {
  return memo(contractMemo, underlying, SIX_HOURS, async () => (await cached(`option-contracts:${underlying}`, SIX_HOURS, async () => (await growwContracts(underlying)) as unknown as Prisma.InputJsonValue)).value as unknown as OptionContracts);
}
let underlyingMemo: { at: number; value: Promise<string[]> } | null = null;
function optionUnderlyings(): Promise<string[]> {
  if (!underlyingMemo || Date.now() - underlyingMemo.at > SIX_HOURS) {
    const value = cached("option-underlyings", SIX_HOURS, growwUnderlyings).then((r) => r.value);
    underlyingMemo = { at: Date.now(), value };
    value.catch(() => (underlyingMemo = null));
  }
  return underlyingMemo.value;
}

const istToday = (nowMs: number) => new Date(nowMs + 19_800_000).toISOString().slice(0, 10);
/** Contracts stop trading at 15:30 IST on expiry day. */
const upcoming = (expiries: string[], nowMs: number) => expiries.filter((e) => Date.parse(`${e}T15:30:00+05:30`) > nowMs);

// Short caches: a chain for 3 s (Dhan allows one identical request every 3 s; the screen refreshes every 5 s), expiries for 10 min.
const chainCache = new Map<string, { at: number; value: Promise<ParsedChain> }>();
const expiryCache = new Map<string, { at: number; value: Promise<{ expiries: string[]; lotSize: number | null }> }>();
function memo<T>(cache: Map<string, { at: number; value: Promise<T> }>, key: string, ttl: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.value;
  const value = load();
  cache.set(key, { at: Date.now(), value });
  value.catch(() => cache.delete(key));
  if (cache.size > 500) cache.delete(cache.keys().next().value!);
  return value;
}

/** Expiries and lot size from one broker (Groww's come from its public instrument list). */
async function brokerExpiries(broker: ChainBroker, ctx: LiveCtx, userId: string, underlying: string, nowMs: number): Promise<{ expiries: string[]; lotSize: number | null }> {
  return memo(expiryCache, `${userId}|${broker}|${underlying}`, 10 * 60_000, async () => {
    const today = istToday(nowMs);
    const eq = SPOT_SYMBOL[underlying] ? null : await nseEquity(underlying);
    if (broker === "upstox") {
      const key = upstoxUnderlyingKey(underlying, eq);
      if (!key) throw new BrokerError("unknown", `${underlying} isn't an underlying Upstox lists`);
      return parseUpstoxContracts(await brokerSend("upstox", ctx, upstoxContractsRequest(key)), today);
    }
    const listed = await optionContracts(underlying);
    if (broker === "dhan") {
      const u = dhanUnderlying(underlying, eq);
      if (!u) throw new BrokerError("unknown", `${underlying} isn't available from Dhan here yet`);
      return { expiries: parseDhanExpiries(await brokerSend("dhan", ctx, dhanExpiriesRequest(u)), today), lotSize: listed.lotSize };
    }
    return { expiries: listed.expiries.filter((e) => e >= today), lotSize: listed.lotSize };
  });
}

async function brokerChain(broker: ChainBroker, ctx: LiveCtx, userId: string, underlying: string, expiry: string): Promise<ParsedChain> {
  return memo(chainCache, `${userId}|${broker}|${underlying}|${expiry}`, 3_000, async () => {
    const eq = SPOT_SYMBOL[underlying] ? null : await nseEquity(underlying);
    if (broker === "groww") return parseGrowwChain(await brokerSend("groww", ctx, growwChainRequest(underlying, expiry)));
    if (broker === "upstox") return parseUpstoxChain(await brokerSend("upstox", ctx, upstoxChainRequest(upstoxUnderlyingKey(underlying, eq)!, expiry)));
    return parseDhanChain(await brokerSend("dhan", ctx, dhanChainRequest(dhanUnderlying(underlying, eq)!, expiry)));
  });
}

const issueText = (err: unknown, name: string): string => {
  if (err instanceof BrokerError) {
    if (err.failure.code === "session_rejected") return `${name} refused option data for this account — its API plan may not include market data.`;
    return describeFailure(err.failure, name).reason;
  }
  return err instanceof Error ? err.message : `${name} didn't answer.`;
};

/** The user's brokers that can give an option chain, logged in for today. */
async function chainBrokers(userId: string): Promise<ChainBroker[]> {
  const conns = await prisma.brokerConnection.findMany({ where: { userId, status: "CONNECTED", tokenExpiresAt: { gt: new Date() } }, select: { broker: true }, orderBy: { createdAt: "asc" } });
  return conns.map((c) => c.broker).filter((b): b is ChainBroker => (CHAIN_BROKERS as readonly string[]).includes(b));
}

const pickExpiry = (expiries: string[], asked?: string | null) => (asked && expiries.includes(asked) ? asked : expiries[0]);

/** The option chain for an underlying and expiry, from the best source this user has. */
export async function loadOptionChain(userId: string, underlyingRaw: string, askedExpiry?: string | null, nowMs = Date.now()): Promise<LoadedChain | { error: string; brokerIssues?: BrokerIssue[] }> {
  const underlying = normaliseUnderlying(underlyingRaw);
  if (!/^[A-Z0-9&-]{1,20}$/.test(underlying)) return { error: "That isn't an option underlying." };
  const brokerIssues: BrokerIssue[] = [];

  // 1. The user's own broker.
  const { session } = await import("@/lib/live/orders"); // loaded late: orders.ts imports market data itself
  for (const broker of await chainBrokers(userId)) {
    const name = brokerById(broker)?.name ?? broker;
    try {
      const ctx = await session(userId, broker);
      const { expiries, lotSize } = await brokerExpiries(broker, ctx, userId, underlying, nowMs);
      const live = upcoming(expiries, nowMs);
      if (!live.length) throw new Error(`${name} lists no upcoming ${underlying} options.`);
      const expiry = pickExpiry(live, askedExpiry);
      const parsed = await brokerChain(broker, ctx, userId, underlying, expiry);
      if (!parsed.rows.length) throw new Error(`${name} returned an empty ${underlying} chain.`);
      const source: ChainSourceInfo = { kind: "broker", broker, name };
      return { chain: enrichChain({ underlying, expiry, lotSize, source, ...parsed }, { nowMs }), expiries: live, brokerIssues };
    } catch (err) {
      brokerIssues.push({ broker, name, reason: issueText(err, name) });
      if (!(err instanceof BrokerError)) logError("options.chain.broker", err, { broker, underlying });
    }
  }

  // 2. The licensed feed (owner accounts only).
  const extras = marketExtrasFor(userId);
  if (extras) {
    try {
      const expiries = await extras.expiries(underlying);
      if (expiries.length) {
        const expiry = pickExpiry(expiries, askedExpiry);
        const [rows, lotSize, ticks] = await Promise.all([
          extras.optionChain(underlying, expiry),
          extras.lotSize(underlying).catch(() => null),
          marketDataFor(userId, "view").getRecentTicks?.(spotSymbolOf(underlying), 1).catch(() => []) ?? [],
        ]);
        const side = (s: (typeof rows)[number]["call"]): RawSide => ({ ...s, rho: null });
        const raw: RawChain = { underlying, expiry, spot: ticks.at(-1)?.price ?? null, spotAt: ticks.at(-1)?.time ?? null, lotSize, source: { kind: "feed", name: "Licensed market data feed" }, hasDepth: true, rows: rows.map((r) => ({ strike: r.strike, call: side(r.call), put: side(r.put) })) };
        return { chain: enrichChain(raw, { nowMs }), expiries, brokerIssues };
      }
    } catch (err) {
      logError("options.chain.feed", err, { underlying });
    }
  }

  // 3. Free trial: real contracts, estimated prices.
  try {
    const listed = await optionContracts(underlying);
    const expiries = upcoming(listed.expiries, nowMs);
    if (!expiries.length) return { error: `${underlying} has no listed options.`, brokerIssues };
    const expiry = pickExpiry(expiries, askedExpiry);
    const market = marketDataFor(userId, "view");
    const candles = await market.getHistoricalCandles(spotSymbolOf(underlying), "3mo", "1d").catch(() => []);
    const spot = candles.at(-1)?.close ?? null;
    const blank: RawSide = { ltp: null, bid: null, ask: null, prevClose: null, volume: null, oi: null, prevOi: null, iv: null, delta: null, gamma: null, theta: null, vega: null, rho: null };
    const raw: RawChain = {
      underlying,
      expiry,
      spot,
      // A daily candle's time is that session's start; its close is at 15:30 IST the same day.
      spotAt: candles.length ? candles.at(-1)!.time + 6.25 * 3600 : null,
      lotSize: listed.lotSize,
      source: { kind: "estimate", name: "Free trial (estimated)", spotFrom: market.name },
      hasDepth: false,
      rows: (listed.strikes[expiry] ?? []).map((strike) => ({ strike, call: { ...blank }, put: { ...blank } })),
    };
    return { chain: enrichChain(raw, { nowMs, assumedIv: historicalVol(candles.map((c) => c.close)) ?? undefined }), expiries, brokerIssues };
  } catch (err) {
    logError("options.chain.trial", err, { underlying });
    return { error: "Couldn't load the option contracts — try again in a moment.", brokerIssues };
  }
}

/** Every NSE option underlying (indices first), for the contract picker. */
export async function listUnderlyings(): Promise<string[]> {
  try {
    return await optionUnderlyings();
  } catch {
    return ["NIFTY", "BANKNIFTY"];
  }
}
