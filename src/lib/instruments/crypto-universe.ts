import { isCryptoSymbol } from "@/lib/market-data/crypto";

// CoinDCX's INR markets become instruments named BTC-INR, ETH-INR…, exchange "CRYPTO". Read from the exchange's public
// market list; anything that doesn't look right is skipped rather than guessed.

export const CRYPTO_SOURCE = "https://api.coindcx.com/exchange/v1/markets_details";

export type CryptoInstrumentRow = { symbol: string; name: string; exchange: "CRYPTO"; sector: "Crypto" };

type Market = { base_currency_short_name?: unknown; target_currency_short_name?: unknown; target_currency_name?: unknown; status?: unknown };

export function parseCryptoMarkets(json: unknown): CryptoInstrumentRow[] {
  if (!Array.isArray(json)) return [];
  const rows: CryptoInstrumentRow[] = [];
  const seen = new Set<string>();
  for (const m of json as Market[]) {
    if (!m || m.base_currency_short_name !== "INR" || m.status !== "active" || typeof m.target_currency_short_name !== "string") continue;
    const base = m.target_currency_short_name.trim().toUpperCase();
    const symbol = `${base}-INR`;
    if (!isCryptoSymbol(symbol) || seen.has(symbol)) continue;
    seen.add(symbol);
    const full = typeof m.target_currency_name === "string" && m.target_currency_name.trim() ? m.target_currency_name.trim() : base;
    rows.push({ symbol, name: full.toUpperCase() === base ? base : `${full} (${base})`, exchange: "CRYPTO", sector: "Crypto" });
  }
  return rows;
}
