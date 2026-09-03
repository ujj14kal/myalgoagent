import { YahooFinanceProvider } from "./providers/yahoo";
import type { MarketDataProvider } from "./types";

// The single source of market data for the whole app. Swapping to an
// official/licensed NSE/BSE provider later means changing this one line —
// every API route, page and component depends only on the
// MarketDataProvider interface, never on YahooFinanceProvider directly.
export const marketDataProvider: MarketDataProvider = new YahooFinanceProvider();

export type { Candle, CandleInterval, CandleRange, MarketDataProvider } from "./types";
