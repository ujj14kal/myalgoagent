import { YahooFinanceProvider } from "./providers/yahoo";
import { parseAllowlist, selectProvider, type MarketDataUse } from "./select";
import type { MarketDataProvider } from "./types";

// The only way to get market data. Every caller says which user it's for and
// what the data is for, so a licensed feed that must not be shown to other
// users (e.g. the TrueData trial) reaches only the accounts listed in
// MARKET_DATA_LICENSED_USER_IDS. Nothing imports a provider directly (a test
// enforces that); with no licensed feed configured, everyone gets Yahoo.

const yahoo = new YahooFinanceProvider();

/** The licensed feed. Stays null until its adapter is added and configured. */
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
} from "./timeframes";
