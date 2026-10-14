import "server-only";
import { prisma } from "@/lib/prisma";
import { CRYPTO_SOURCE, parseCryptoMarkets } from "./crypto-universe";
import { INDEX_INSTRUMENTS, parseBseUniverseCsv, parseUniverseCsv } from "./universe";

const SOURCE = "https://api.dhan.co/v2/instrument/NSE_EQ";
const BSE_SOURCE = "https://api.dhan.co/v2/instrument/BSE_EQ";

/** Adds any NSE equity, main BSE equity (groups A and B) or index that isn't an instrument yet. Never renames or removes (strategies point at them). */
export async function syncInstrumentUniverse(): Promise<{ listed: number; added: number }> {
  const res = await fetch(SOURCE, { signal: AbortSignal.timeout(60_000), cache: "no-store", redirect: "follow" });
  if (!res.ok) throw new Error(`NSE master: HTTP ${res.status}`);
  const nse = parseUniverseCsv(await res.text());
  if (nse.length < 1000) throw new Error("NSE master: suspiciously short list");
  // BSE is additional: if its list can't be read today, the NSE list still syncs.
  const bse = await fetch(BSE_SOURCE, { signal: AbortSignal.timeout(60_000), cache: "no-store", redirect: "follow" })
    .then(async (r) => (r.ok ? parseBseUniverseCsv(await r.text()) : []))
    .then((rows) => (rows.length >= 500 ? rows : []))
    .catch(() => []);
  // Crypto is additional too: if CoinDCX can't be read today, the stock lists still sync.
  const crypto = await fetch(CRYPTO_SOURCE, { signal: AbortSignal.timeout(30_000), cache: "no-store" })
    .then(async (r) => (r.ok ? parseCryptoMarkets(await r.json()) : []))
    .then((rows) => (rows.length >= 20 ? rows : []))
    .catch(() => []);
  const rows = [...nse, ...bse, ...INDEX_INSTRUMENTS, ...crypto];
  const { count } = await prisma.instrument.createMany({ data: rows, skipDuplicates: true });
  return { listed: rows.length, added: count };
}
