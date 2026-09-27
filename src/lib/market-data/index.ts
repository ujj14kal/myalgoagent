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
    async getHistoricalCandles(symbol, range, interval) {
      if (interval === "3m") return resampleCandles(await p.getHistoricalCandles(symbol, clampRangeForInterval(range, "1m"), "1m"), fixedBucket(3));
      if (interval === "4h") return resampleCandles(await p.getHistoricalCandles(symbol, clampRangeForInterval(range, "60m"), "60m"), fourHourBucket);
      return p.getHistoricalCandles(symbol, range, interval);
    },
  };
}

const yahoo = withDerivedTimeframes(new YahooFinanceProvider());

/** The licensed feed. Stays null until its adapter is added and configured — wrap it with withDerivedTimeframes too. */
const licensed: MarketDataProvider | null = null;

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

export type { MarketDataUse } from "./select";
export type { Candle, CandleInterval, CandleRange, MarketDataProvider } from "./types";
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
