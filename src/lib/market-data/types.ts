export interface Candle {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type CandleRange = "1mo" | "3mo" | "6mo" | "1y" | "5y";
export type CandleInterval = "1d" | "1wk";

export interface MarketDataProvider {
  readonly name: string;
  readonly isOfficial: boolean;
  getHistoricalCandles(
    symbol: string,
    range: CandleRange,
    interval: CandleInterval,
  ): Promise<Candle[]>;
}
