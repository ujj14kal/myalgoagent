import { cached } from "@/lib/jobs";
import { parseDhanNseCsv, type NseEquity } from "./nse-master";

// Loads the NSE equity master (see nse-master.ts), cached for a day across
// server instances and for a few hours in memory.

const SOURCE = "https://api.dhan.co/v2/instrument/NSE_EQ";

async function load(): Promise<Record<string, NseEquity>> {
  const res = await fetch(SOURCE, { signal: AbortSignal.timeout(30_000), cache: "no-store", redirect: "follow" });
  if (!res.ok) throw new Error(`NSE master: HTTP ${res.status}`);
  const map = parseDhanNseCsv(await res.text());
  if (Object.keys(map).length < 1000) throw new Error("NSE master: suspiciously short list");
  return map;
}

let memo: { at: number; map: Record<string, NseEquity> } | null = null;

/** The NSE equity for a plain trading symbol ("RELIANCE"), or null if it isn't a listed equity. */
export async function nseEquity(symbol: string): Promise<NseEquity | null> {
  if (!memo || Date.now() - memo.at > 6 * 3_600_000) {
    const { value } = await cached("nse-master", 24 * 3_600_000, load);
    memo = { at: Date.now(), map: value };
  }
  return memo.map[symbol.toUpperCase()] ?? null;
}

