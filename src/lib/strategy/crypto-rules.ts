import { isCryptoSymbol } from "@/lib/market-data/crypto";

// How a crypto strategy differs from a stock one. Crypto is bought outright (spot) and trades around the clock, so there is
// no intraday product, no square-off time, no "no entries after" time, and no short side. Everything else is the same.

type Fit = { direction: string; productType?: string; noEntryAfterMinute?: number | null; squareOffMinute?: number | null; mode?: string };

export const CRYPTO_SHORT_MESSAGE = "Crypto is bought outright, so a crypto strategy is long only. Selling short isn't available.";
export const CRYPTO_WEBHOOK_MESSAGE = "Webhook strategies are for stocks. Crypto strategies use rules built here.";

/** The strategy settings that fit this instrument, or an error in plain words. Stocks are returned unchanged. */
export function fitToInstrument<T extends Fit>(input: T, symbol: string): T {
  if (!isCryptoSymbol(symbol)) return input;
  if (input.direction === "SHORT") throw new Error(CRYPTO_SHORT_MESSAGE);
  if (input.mode === "WEBHOOK") throw new Error(CRYPTO_WEBHOOK_MESSAGE);
  return { ...input, productType: "DELIVERY", noEntryAfterMinute: null, squareOffMinute: null };
}
