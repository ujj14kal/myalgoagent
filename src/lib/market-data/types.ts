export interface Candle {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type CandleRange = "1d" | "5d" | "1mo" | "3mo" | "6mo" | "ytd" | "1y" | "5y" | "max";
export type CandleInterval = "1m" | "2m" | "5m" | "15m" | "30m" | "60m" | "1d" | "1wk" | "1mo";

export interface MarketDataProvider {
  readonly name: string;
  readonly isOfficial: boolean;
  getHistoricalCandles(
    symbol: string,
    range: CandleRange,
    interval: CandleInterval,
  ): Promise<Candle[]>;
}
