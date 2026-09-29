import { FeedDownError, TrueDataProvider } from "./providers/truedata";
import { MarketExtras } from "./extras";
import { YahooFinanceProvider } from "./providers/yahoo";
import { parseAllowlist, selectProvider, type MarketDataUse } from "./select";
import { fixedBucket, fourHourBucket, resampleCandles } from "./resample";
import { clampRangeForInterval } from "./timeframes";
import type { MarketDataProvider } from "./types";

// The only way to get market data. Every caller says which user it's for and
// what the data is for, so a licensed feed that must not be shown to other
// users (e.g. the TrueData trial) reaches only the accounts listed in
// MARKET_DATA_LICENSED_USER_IDS. Nothing imports a provider directly (a test
// enforces that); with no licensed feed configured, everyone gets Yahoo.

/** Adds the timeframes a source doesn't offer, built from smaller candles. */
function withDerivedTimeframes(p: MarketDataProvider): MarketDataProvider {
  return {
    name: p.name,
    isOfficial: p.isOfficial,
    depth: p.depth,
    getRecentTicks: p.getRecentTicks?.bind(p),
    async getHistoricalCandles(symbol, range, interval) {
      if (interval === "3m") return resampleCandles(await p.getHistoricalCandles(symbol, clampRangeForInterval(range, "1m", p.depth), "1m"), fixedBucket(3));
      if (interval === "4h") return resampleCandles(await p.getHistoricalCandles(symbol, clampRangeForInterval(range, "60m", p.depth), "60m"), fourHourBucket);
      return p.getHistoricalCandles(symbol, range, interval);
    },
  };
}

const yahoo = withDerivedTimeframes(new YahooFinanceProvider());

const trueData = TrueDataProvider.fromEnv();

/**
 * The licensed feed — null unless MARKET_DATA_TRUEDATA_USER/_PASSWORD are set.
 * Allow-listed accounts get TrueData only: a failed request is retried inside
 * the provider and then surfaces as an error, never silently swapped for Yahoo.
 * The one exception is the feed itself going away (subscription ended, login
 * refused): then everything quietly runs on the fallback — charts, backtests,
 * forward tests — and switches back on its own once a login works again
 * (rechecked every 10 minutes). Every feature keeps working either way.
 */
function withFeedGuard(td: TrueDataProvider, primary: MarketDataProvider, fallback: MarketDataProvider): MarketDataProvider {
  return {
    get name() {
      return td.isAvailable() ? primary.name : fallback.name;
    },
    get isOfficial() {
      return td.isAvailable() ? primary.isOfficial : fallback.isOfficial;
    },
    get depth() {
      return td.isAvailable() ? primary.depth : fallback.depth;
    },
    get getRecentTicks() {
      return td.isAvailable() ? primary.getRecentTicks : undefined;
    },
    async getHistoricalCandles(symbol, range, interval) {
      if (!td.isAvailable()) return fallback.getHistoricalCandles(symbol, clampRangeForInterval(range, interval, fallback.depth), interval);
      try {
        return await primary.getHistoricalCandles(symbol, range, interval);
      } catch (err) {
        if (err instanceof FeedDownError) return fallback.getHistoricalCandles(symbol, clampRangeForInterval(range, interval, fallback.depth), interval);
        throw err;
      }
    },
  };
}

const licensed: MarketDataProvider | null = trueData ? withFeedGuard(trueData, withDerivedTimeframes(trueData), yahoo) : null;

/** Whether the licensed feed is configured and currently answering (for the admin portal). */
export function licensedFeedStatus() {
  return trueData ? { configured: true as const, ...trueData.status() } : { configured: false as const };
}

export function marketDataFor(userId: string | null | undefined, use: MarketDataUse): MarketDataProvider {
  return selectProvider({
    userId,
    use,
    licensed,
    allowlist: parseAllowlist(process.env.MARKET_DATA_LICENSED_USER_IDS),
    licensedForTrading: process.env.MARKET_DATA_LICENSED_FOR_TRADING === "true",
    fallback: yahoo,
  });
}

const extras = trueData ? new MarketExtras(trueData) : null;

/**
 * Market movers, breadth, option chains etc. — only for accounts that get the
 * licensed feed for viewing (same allow-list as marketDataFor); null for everyone else.
 */
export function marketExtrasFor(userId: string | null | undefined): MarketExtras | null {
  return extras && trueData?.isAvailable() && marketDataFor(userId, "view") === licensed ? extras : null;
}

export type { MarketDataUse } from "./select";
export type { Active, Breadth, ChainRow, CorpAction, Mover, OptionSide } from "./extras";
export { maxPain, pcr, optionUnderlying } from "./extras";
export type { Candle, CandleInterval, CandleRange, MarketDataProvider, Tick } from "./types";
export type { HistoryDepth } from "./timeframes";
export {
  RANGES,
  INTERVALS,
  isValidCombo,
  defaultIntervalForRange,
  maxRangeForInterval,
  clampRangeForInterval,
  VALID_RANGES,
  VALID_INTERVALS,
  intervalDurationSeconds,
  isIntraday,
} from "./timeframes";
