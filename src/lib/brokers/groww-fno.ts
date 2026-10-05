// Groww's F&O contracts, from its public instrument list
// (https://growwapi-assets.groww.in/instruments/instrument.csv). Groww names
// weekly options in the exchange's compact form ("NIFTY26O0622700CE") and
// monthlies differently ("NIFTY26NOV22700CE"), so a contract is always looked
// up by underlying + expiry + strike + type — never built from a pattern.

export type GrowwOption = { tradingSymbol: string; exchangeToken: string; lotSize: number; tick: number; freezeQty: number | null; buyAllowed: boolean; sellAllowed: boolean };

export const optionKey = (underlying: string, expiry: string, strike: number, type: "CE" | "PE") => `${underlying}|${expiry}|${strike}|${type}`;

/** Option contracts of one underlying from the instrument CSV, keyed by optionKey. */
export function parseGrowwOptions(csv: string, underlying: string): Map<string, GrowwOption> {
  const lines = csv.split(/\r?\n/);
  const head = lines[0].split(",");
  const col = (n: string) => head.indexOf(n);
  const c = {
    exchange: col("exchange"),
    token: col("exchange_token"),
    symbol: col("trading_symbol"),
    type: col("instrument_type"),
    segment: col("segment"),
    underlying: col("underlying_symbol"),
    expiry: col("expiry_date"),
    strike: col("strike_price"),
    lot: col("lot_size"),
    tick: col("tick_size"),
    freeze: col("freeze_quantity"),
    buy: col("buy_allowed"),
    sell: col("sell_allowed"),
  };
  if (Object.values(c).some((i) => i < 0)) throw new Error("Groww instruments: unexpected columns");
  const out = new Map<string, GrowwOption>();
  const needle = `,${underlying},`;
  for (const line of lines) {
    if (!line.includes(needle) || !line.includes(",FNO,")) continue;
    const f = line.split(",");
    if (f[c.exchange] !== "NSE" || f[c.segment] !== "FNO" || f[c.underlying] !== underlying) continue;
    const type = f[c.type];
    if (type !== "CE" && type !== "PE") continue;
    const strike = Number(f[c.strike]);
    const lot = Number(f[c.lot]);
    if (!Number.isFinite(strike) || !(lot > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(f[c.expiry])) continue;
    out.set(optionKey(underlying, f[c.expiry], strike, type), {
      tradingSymbol: f[c.symbol],
      exchangeToken: f[c.token],
      lotSize: lot,
      tick: Number(f[c.tick]) || 0.05,
      freezeQty: Number(f[c.freeze]) > 0 ? Number(f[c.freeze]) : null,
      buyAllowed: f[c.buy] !== "0",
      sellAllowed: f[c.sell] !== "0",
    });
  }
  return out;
}

const SOURCE = "https://growwapi-assets.groww.in/instruments/instrument.csv";
const memo = new Map<string, { at: number; map: Map<string, GrowwOption> }>();
let csvMemo: { at: number; text: Promise<string> } | null = null;
const TTL = 6 * 3_600_000;

function instrumentCsv(): Promise<string> {
  if (!csvMemo || Date.now() - csvMemo.at > TTL) {
    const text = fetch(SOURCE, { signal: AbortSignal.timeout(60_000), cache: "no-store" }).then((r) => {
      if (!r.ok) throw new Error(`Groww instruments: HTTP ${r.status}`);
      return r.text();
    });
    csvMemo = { at: Date.now(), text };
    text.catch(() => (csvMemo = null));
  }
  return csvMemo.text;
}

async function optionsOf(underlying: string): Promise<Map<string, GrowwOption>> {
  let hit = memo.get(underlying);
  if (!hit || Date.now() - hit.at > TTL) {
    hit = { at: Date.now(), map: parseGrowwOptions(await instrumentCsv(), underlying) };
    memo.set(underlying, hit);
  }
  return hit.map;
}

/** One Groww option contract, or null if Groww doesn't list it. */
export async function growwOption(underlying: string, expiry: string, strike: number, type: "CE" | "PE"): Promise<GrowwOption | null> {
  return (await optionsOf(underlying)).get(optionKey(underlying, expiry, strike, type)) ?? null;
}

export type OptionContracts = { expiries: string[]; lotSize: number | null; strikes: Record<string, number[]> };

/** Listed expiries (soonest first), strikes per expiry and the lot size, from parsed contracts. Pure, for tests. */
export function contractsFrom(map: Map<string, GrowwOption>): OptionContracts {
  const strikes: Record<string, Set<number>> = {};
  let lotSize: number | null = null;
  for (const [key, o] of map) {
    const [, expiry, strike] = key.split("|");
    (strikes[expiry] ??= new Set()).add(Number(strike));
    lotSize ??= o.lotSize;
  }
  const expiries = Object.keys(strikes).sort();
  return { expiries, lotSize, strikes: Object.fromEntries(expiries.map((e) => [e, [...strikes[e]].sort((a, b) => a - b)])) };
}

/**
 * The exchange's option contracts for an underlying — expiries, strikes and lot size — from Groww's public
 * instrument list. This is reference data about the contracts (no prices), so every account can use it.
 */
export async function optionContracts(underlying: string): Promise<OptionContracts> {
  return contractsFrom(await optionsOf(underlying));
}

/** Every underlying with NSE options (indices first, then stocks A–Z). Pure, for tests. */
export function underlyingsFrom(csv: string): string[] {
  const lines = csv.split(/\r?\n/);
  const head = lines[0].split(",");
  const [ex, seg, type, und] = ["exchange", "segment", "instrument_type", "underlying_symbol"].map((n) => head.indexOf(n));
  const out = new Set<string>();
  for (const line of lines) {
    if (!line.includes(",FNO,")) continue;
    const f = line.split(",");
    if (f[ex] === "NSE" && f[seg] === "FNO" && (f[type] === "CE" || f[type] === "PE") && f[und]) out.add(f[und]);
  }
  const indices = ["NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY", "NIFTYNXT50"].filter((i) => out.has(i));
  return [...indices, ...[...out].filter((u) => !indices.includes(u)).sort()];
}

let underlyingsMemo: { at: number; list: string[] } | null = null;
export async function optionUnderlyings(): Promise<string[]> {
  if (!underlyingsMemo || Date.now() - underlyingsMemo.at > TTL) underlyingsMemo = { at: Date.now(), list: underlyingsFrom(await instrumentCsv()) };
  return underlyingsMemo.list;
}
