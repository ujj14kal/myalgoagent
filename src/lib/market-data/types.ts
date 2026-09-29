export interface Candle {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type CandleRange = "1d" | "5d" | "1mo" | "3mo" | "6mo" | "ytd" | "1y" | "5y" | "max";
// "3m" and "4h" aren't offered by the data source — they're built from 1m / 60m (see resample.ts).
// "2m" is no longer offered in the pickers but stays valid for strategies saved with it.
export type CandleInterval = "1m" | "2m" | "3m" | "5m" | "15m" | "30m" | "60m" | "4h" | "1d" | "1wk" | "1mo";

/** One trade from a live feed (volume = shares in this trade/snapshot, not the day's total). */
export interface Tick {
  time: number; // unix seconds
  price: number;
  volume: number;
  bid: number | null;
  ask: number | null;
  bidQty: number | null;
  askQty: number | null;
}

export interface MarketDataProvider {
  readonly name: string;
  readonly isOfficial: boolean;
  /** How far back intraday history goes — see HistoryDepth in timeframes.ts. */
  readonly depth: "standard" | "extended";
  getHistoricalCandles(
    symbol: string,
    range: CandleRange,
    interval: CandleInterval,
  ): Promise<Candle[]>;
  /** The most recent trades, oldest first — only sources with a live feed have this. */
  getRecentTicks?(symbol: string, count: number): Promise<Tick[]>;
}
