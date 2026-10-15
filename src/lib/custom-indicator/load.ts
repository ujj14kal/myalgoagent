import "server-only";
import { prisma } from "@/lib/prisma";
import { userMarketData } from "@/lib/market-data/for-user";
import type { Externals } from "./formula";

export const SYMBOLS_AT_ONCE = 5;

/** Candles of every other instrument an indicator reads with sym(), on the same candle size, for charts and tests. */
export async function loadInstrumentCandles(userId: string, symbols: string[], interval: string, range: string): Promise<Externals["instruments"]> {
  if (!symbols.length) return {};
  if (symbols.length > SYMBOLS_AT_ONCE) throw new Error(`An indicator can read at most ${SYMBOLS_AT_ONCE} other instruments at once.`);
  const known = await prisma.instrument.findMany({ where: { symbol: { in: symbols } }, select: { symbol: true } });
  const missing = symbols.filter((s) => !known.some((k) => k.symbol === s));
  if (missing.length) throw new Error(`${missing.join(", ")} isn't an instrument on this platform (write it as it appears on the instrument page, like RELIANCE.NS or ^NSEI).`);
  const market = userMarketData(userId, "view");
  const entries = await Promise.all(
    symbols.map(async (s) => [s, await market.getHistoricalCandles(s, range as Parameters<typeof market.getHistoricalCandles>[1], interval as Parameters<typeof market.getHistoricalCandles>[2])] as const),
  );
  return Object.fromEntries(entries);
}

