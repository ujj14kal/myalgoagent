import type {
  Candle,
  CandleInterval,
  CandleRange,
  MarketDataProvider,
} from "../types";

interface YahooChartResponse {
  chart: {
    result: Array<{
      timestamp: number[];
      indicators: {
        quote: Array<{
          open: (number | null)[];
          high: (number | null)[];
          low: (number | null)[];
          close: (number | null)[];
          volume: (number | null)[];
        }>;
      };
    }> | null;
    error: { code: string; description: string } | null;
  };
}

// Interim data source — not an official NSE/BSE feed. Marked isOfficial:
// false so every consumer can render an honest label. Swap this class out
// (and the export in ../index.ts) for a licensed provider later; nothing
// else in the codebase needs to change.
export class YahooFinanceProvider implements MarketDataProvider {
  readonly name = "Yahoo Finance";
  readonly isOfficial = false;

  async getHistoricalCandles(
    symbol: string,
    range: CandleRange,
    interval: CandleInterval,
  ): Promise<Candle[]> {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;

    const res = await fetch(url, {
      // Explicitly declining compression, rather than trusting the runtime
      // to transparently gzip-decode the response: under Next's dev-server
      // fetch instrumentation (the `next: { revalidate }` cache layer,
      // Turbopack), a gzip-encoded response has been observed reaching
      // `res.json()` still compressed — its raw magic bytes (`1f 8b 08 00`)
      // parsed as JSON and surfaced as a bafflingly generic SyntaxError.
      // Asking Yahoo not to compress at all sidesteps that ambiguity
      // everywhere, at the cost of a slightly larger response body.
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MyAlgoAgent/1.0)", "Accept-Encoding": "identity" },
      next: { revalidate: 60 },
    });

    if (!res.ok) {
      throw new Error(`Yahoo Finance request failed: ${res.status}`);
    }

    const data = (await res.json()) as YahooChartResponse;

    if (data.chart.error) {
      throw new Error(`Yahoo Finance error: ${data.chart.error.description}`);
    }

    const result = data.chart.result?.[0];
    if (!result) {
      throw new Error(`No data returned for symbol "${symbol}"`);
    }

    const { timestamp, indicators } = result;
    const quote = indicators.quote[0];
    // Yahoo can return a `result` object with no `timestamp` array at all —
    // e.g. requesting today's intraday 1-minute bars when there's no
    // trading session today (a weekend/holiday) — rather than an error or
    // an empty array. Treat that the same as "no data" instead of crashing.
    if (!timestamp || !quote) return [];

    const candles: Candle[] = [];
    for (let i = 0; i < timestamp.length; i++) {
      const open = quote.open[i];
      const high = quote.high[i];
      const low = quote.low[i];
      const close = quote.close[i];
      const volume = quote.volume[i];

      // Skip bars with missing data (holidays, halts) rather than
      // fabricating values.
      if (open == null || high == null || low == null || close == null) {
        continue;
      }

      candles.push({
        time: timestamp[i],
        open,
        high,
        low,
        close,
        volume: volume ?? 0,
      });
    }

    return candles;
  }
}
