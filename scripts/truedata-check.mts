// Checks the TrueData history feed with the credentials in .env.local:
//   npx tsx --env-file=.env.local scripts/truedata-check.mts [SYMBOL.NS ...]
// Prints candle counts, first/last candle and timing per timeframe. Never prints credentials.
import { TrueDataProvider } from "../src/lib/market-data/providers/truedata";
import type { CandleInterval, CandleRange } from "../src/lib/market-data/types";

const provider = TrueDataProvider.fromEnv();
if (!provider) {
  console.error("Set MARKET_DATA_TRUEDATA_USER and MARKET_DATA_TRUEDATA_PASSWORD in .env.local first.");
  process.exit(1);
}

const symbols = process.argv.slice(2).length ? process.argv.slice(2) : ["RELIANCE.NS", "^NSEI", "^NSEBANK"];
const combos: [CandleRange, CandleInterval][] = [["1d", "1m"], ["5d", "5m"], ["1mo", "15m"], ["1y", "60m"], ["5y", "1d"], ["max", "1wk"]];
const fmt = (t: number) => new Date(t * 1000).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

for (const symbol of symbols) {
  for (const [range, interval] of combos) {
    const started = Date.now();
    try {
      const c = await provider.getHistoricalCandles(symbol, range, interval);
      const first = c[0], last = c[c.length - 1];
      console.log(`${symbol.padEnd(12)} ${range.padEnd(4)} ${interval.padEnd(4)} ${String(c.length).padStart(6)} candles  ${first ? fmt(first.time) : "-"} → ${last ? `${fmt(last.time)} close ${last.close}` : "-"}  (${Date.now() - started} ms)`);
    } catch (err) {
      console.log(`${symbol.padEnd(12)} ${range.padEnd(4)} ${interval.padEnd(4)} ERROR ${(err as Error).message}`);
    }
  }
}
