import "server-only";
import type { CandleInterval, CandleRange, MarketDataProvider } from "./types";
import { marketDataFor, type MarketDataUse } from "./index";
import { clampRangeForInterval } from "./timeframes";
import { logWarn } from "@/lib/logger";

// Charts, backtests and previews for a signed-in user: candles from the user's OWN broker
// account when it supplies data; otherwise the general feed (Yahoo, or the licensed feed for
// allow-listed accounts) — e.g. free-trial users, or a broker whose API plan has no data.
// Trading paths (forward tests, webhooks) keep marketDataFor: switching their source
// mid-session would break candle matching. Live strategies pin their source at Go live.

type Choice = { broker: string; at: number } | { broker: null; at: number };
const choiceCache = new Map<string, Choice>();
/** Brokers that refused data recently (no data plan, logged out): skipped for a while. */
const refused = new Map<string, number>();
const candleCache = new Map<string, { at: number; value: Awaited<ReturnType<MarketDataProvider["getHistoricalCandles"]>> }>();

const CHOICE_TTL = 60_000;
const REFUSED_TTL = 15 * 60_000;

async function pickBroker(userId: string): Promise<string | null> {
  const hit = choiceCache.get(userId);
  if (hit && Date.now() - hit.at < CHOICE_TTL) return hit.broker;
  const [{ prisma }, { CANDLE_SOURCES }] = await Promise.all([import("@/lib/prisma"), import("@/lib/brokers/broker-candles")]);
  const conns = await prisma.brokerConnection.findMany({ where: { userId, status: "CONNECTED" }, select: { broker: true, tokenExpiresAt: true }, orderBy: { updatedAt: "desc" } });
  const now = new Date();
  const usable = conns.find((c) => c.tokenExpiresAt && c.tokenExpiresAt > now && CANDLE_SOURCES[c.broker as keyof typeof CANDLE_SOURCES] && !((refused.get(`${userId}:${c.broker}`) ?? 0) > Date.now()));
  const broker = usable?.broker ?? null;
  choiceCache.set(userId, { broker, at: Date.now() });
  return broker;
}

/** For tests and after a broker login: forget the cached choice. */
export function forgetBrokerChoice(userId: string) {
  choiceCache.delete(userId);
  for (const k of refused.keys()) if (k.startsWith(`${userId}:`)) refused.delete(k);
  for (const k of candleCache.keys()) if (k.startsWith(`${userId}:`)) candleCache.delete(k);
}

/**
 * Same as userMarketData, but picks the user's broker up front, so `depth` (how far back history
 * goes) already reflects it — backtests size their period from that before fetching.
 */
export async function userMarketDataReady(userId: string | null | undefined, use: Exclude<MarketDataUse, "trading">): Promise<MarketDataProvider> {
  const p = userMarketData(userId, use);
  if (userId) {
    const broker = await pickBroker(userId).catch(() => null);
    if (broker) {
      const { brokerMarketData } = await import("@/lib/brokers/broker-data");
      (p as { prefer?: (q: MarketDataProvider) => void }).prefer?.(brokerMarketData(userId, broker as never));
    }
  }
  return p;
}

export function userMarketData(userId: string | null | undefined, use: Exclude<MarketDataUse, "trading">): MarketDataProvider {
  const general = marketDataFor(userId, use);
  if (!userId) return general;
  let used: MarketDataProvider = general;
  const provider: MarketDataProvider & { prefer(q: MarketDataProvider): void } = {
    prefer(q) {
      used = q;
    },
    get name() {
      return used.name;
    },
    get isOfficial() {
      return used.isOfficial;
    },
    get depth() {
      return used.depth;
    },
    get getRecentTicks() {
      return used === general ? general.getRecentTicks : undefined;
    },
    async getHistoricalCandles(symbol: string, range: CandleRange, interval: CandleInterval) {
      const broker = await pickBroker(userId).catch(() => null);
      if (broker && symbol.toUpperCase().endsWith(".NS")) {
        const key = `${userId}:${broker}:${symbol}:${range}:${interval}`;
        const cached = candleCache.get(key);
        // A short cache keeps chart refreshes from using up the broker's request allowance (shared with orders).
        if (cached && Date.now() - cached.at < 10_000) return cached.value.map((c) => ({ ...c }));
        try {
          const { brokerMarketData } = await import("@/lib/brokers/broker-data");
          const p = brokerMarketData(userId, broker as never);
          const value = await p.getHistoricalCandles(symbol, range, interval);
          used = p;
          candleCache.set(key, { at: Date.now(), value });
          if (candleCache.size > 500) candleCache.clear();
          return value;
        } catch (err) {
          const { BrokerDataUnavailable } = await import("@/lib/brokers/broker-data");
          if (err instanceof BrokerDataUnavailable && (err.reason === "no_access" || err.reason === "logged_out" || err.reason === "no_source")) {
            refused.set(`${userId}:${broker}`, Date.now() + REFUSED_TTL);
            choiceCache.delete(userId);
          }
          logWarn("market-data.broker", err instanceof Error ? err.message : String(err), { broker, symbol, interval });
        }
      }
      used = general;
      return general.getHistoricalCandles(symbol, clampRangeForInterval(range, interval, general.depth), interval);
    },
  };
  return provider;
}
