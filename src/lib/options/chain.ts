import { blackScholes, daysToYears, impliedVol } from "./black-scholes";

// One option chain, whatever it came from (the user's broker, the licensed
// feed, or a free-trial estimate), with every Greek labelled by where it came
// from, and warnings for prices that can't be trusted. Pure — the adapters
// that fetch chains live in broker-chains.ts / chain-source.ts.

export type GreekName = "iv" | "delta" | "gamma" | "theta" | "vega" | "rho";
export const GREEKS: GreekName[] = ["iv", "delta", "gamma", "theta", "vega", "rho"];

/**
 * provided   — given by the data source (the user's broker or the licensed feed);
 * calculated — worked out by us (Black–Scholes) from this contract's own market price;
 * estimated  — worked out by us from an assumed volatility, because the contract has no usable price.
 */
export type Origin = "provided" | "calculated" | "estimated";
export type Figure = { value: number | null; origin: Origin | null };

/** A contract's quote as the source gave it. IV as a decimal (0.15 = 15%); null = not given. */
export type RawSide = {
  symbol?: string;
  ltp: number | null;
  bid: number | null;
  ask: number | null;
  prevClose: number | null;
  volume: number | null;
  oi: number | null;
  prevOi: number | null;
  iv: number | null;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  rho: number | null;
};
export type RawRow = { strike: number; call: RawSide; put: RawSide };

export type ChainSourceInfo =
  | { kind: "broker"; broker: string; name: string }
  | { kind: "feed"; name: string }
  | { kind: "estimate"; name: string; spotFrom: string };

export type RawChain = {
  underlying: string;
  expiry: string; // yyyy-mm-dd
  spot: number | null;
  /** When the spot was last updated (unix seconds), if the source says. */
  spotAt?: number | null;
  lotSize: number | null;
  source: ChainSourceInfo;
  /** Whether the source gives bid/ask at all (some chains only carry the last price). */
  hasDepth: boolean;
  rows: RawRow[];
};

export type ContractFlag =
  | "expired" // past 15:30 IST on expiry day
  | "no_price" // no last price and no bid/ask
  | "one_sided" // only a bid or only an ask
  | "wide_spread" // bid–ask gap over 10% of the mid
  | "no_trades_today" // zero volume today: the last price is from an earlier session
  | "no_activity"; // no volume and no open interest at all

export type PriceBasis = "mid" | "ltp" | "estimate" | null;

export type ChainSide = RawSide & {
  /** The price the IV and Greeks were worked from. */
  price: number | null;
  basis: PriceBasis;
  greeks: Record<GreekName, Figure>;
  flags: ContractFlag[];
};
export type ChainRow = { strike: number; call: ChainSide; put: ChainSide };

export type ChainNotice = "market_closed" | "expired" | "no_spot" | "stale_spot" | "trial_estimates";

export type OptionChain = Omit<RawChain, "rows"> & {
  daysToExpiry: number;
  asOf: number; // unix seconds the chain was fetched
  rate: number;
  atmStrike: number | null;
  atmIv: number | null;
  /** The volatility used for contracts with no usable price of their own. */
  assumedIv: number;
  /** Strike spacing (the most common gap between listed strikes). */
  step: number;
  notices: ChainNotice[];
  rows: ChainRow[];
};

/** Annual risk-free rate used when we calculate Greeks (shown next to them). */
export const DEFAULT_RATE = 0.065;
/** Volatility assumed when a chain gives no IV to lean on at all. */
export const FALLBACK_IV = 0.15;
const WIDE_SPREAD = 0.1;

/** Days left until 15:30 IST on the expiry date (0 once it has passed). */
export function daysToExpiry(expiry: string, nowMs: number): number {
  return Math.max((Date.parse(`${expiry}T15:30:00+05:30`) - nowMs) / 86_400_000, 0);
}

/** NSE cash/F&O session, 09:15–15:30 IST on weekdays (exchange holidays aren't known here). */
export function marketOpen(nowMs: number): boolean {
  const ist = new Date(nowMs + 19_800_000);
  const day = ist.getUTCDay();
  const m = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return day >= 1 && day <= 5 && m >= 555 && m < 930;
}

export function strikeStep(strikes: number[]): number {
  const gaps = new Map<number, number>();
  for (let i = 1; i < strikes.length; i++) {
    const g = Math.round((strikes[i] - strikes[i - 1]) * 100) / 100;
    if (g > 0) gaps.set(g, (gaps.get(g) ?? 0) + 1);
  }
  return [...gaps.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? 50;
}

const pos = (n: number | null | undefined) => (typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null);

/** Which price to work from, and what's wrong with it. */
function priceOf(s: RawSide, hasDepth: boolean, expired: boolean): { price: number | null; basis: PriceBasis; flags: ContractFlag[] } {
  const flags: ContractFlag[] = [];
  if (expired) flags.push("expired");
  const bid = pos(s.bid);
  const ask = pos(s.ask);
  const ltp = pos(s.ltp);
  if (!ltp && !bid && !ask) flags.push("no_price");
  if (hasDepth && (bid ? !ask : !!ask)) flags.push("one_sided");
  let mid: number | null = null;
  if (bid && ask && ask >= bid) {
    mid = Math.round(((bid + ask) / 2) * 100) / 100;
    if ((ask - bid) / mid > WIDE_SPREAD) flags.push("wide_spread");
  }
  if (s.volume === 0) flags.push(s.oi === 0 || s.oi === null ? "no_activity" : "no_trades_today");
  // A tight two-sided market is the fairest price; otherwise the last trade.
  if (mid && !flags.includes("wide_spread")) return { price: mid, basis: "mid", flags };
  if (ltp) return { price: ltp, basis: "ltp", flags };
  if (mid) return { price: mid, basis: "mid", flags };
  return { price: null, basis: null, flags };
}

/** Fill in IV and Greeks for one contract, labelling each figure. */
type SideCtx = { spot: number | null; years: number; rate: number; assumedIv: number; hasDepth: boolean; expired: boolean; estimatePrices: boolean };

function enrichSide(s: RawSide, type: "CE" | "PE", strike: number, ctx: SideCtx): ChainSide {
  const priced = priceOf(s, ctx.hasDepth, ctx.expired);
  let { price, basis } = priced;
  // Free trial (no live option prices): the price itself is our model estimate, and says so.
  const flags = ctx.estimatePrices ? priced.flags.filter((f) => f !== "no_price") : priced.flags;
  if (ctx.estimatePrices && price === null && ctx.spot && !ctx.expired) {
    price = Math.round(blackScholes({ type, spot: ctx.spot, strike, years: ctx.years, vol: ctx.assumedIv, rate: ctx.rate }).price * 20) / 20;
    basis = "estimate";
  }
  const greeks = Object.fromEntries(GREEKS.map((g) => [g, { value: null, origin: null }])) as Record<GreekName, Figure>;
  const provided = (g: GreekName) => {
    const v = s[g];
    return typeof v === "number" && Number.isFinite(v) && (g !== "iv" || v > 0) ? v : null;
  };
  for (const g of GREEKS) {
    const v = provided(g);
    if (v !== null) greeks[g] = { value: v, origin: "provided" };
  }
  if (ctx.expired || !ctx.spot) return { ...s, price, basis, greeks, flags };

  // IV: the source's, else implied from this contract's own price, else the assumed one.
  if (greeks.iv.value === null) {
    const implied = price && basis !== "estimate" ? impliedVol(price, { type, spot: ctx.spot, strike, years: ctx.years, rate: ctx.rate }) : null;
    greeks.iv = implied && implied > 0.005 ? { value: implied, origin: "calculated" } : { value: ctx.assumedIv, origin: "estimated" };
  }
  const iv = greeks.iv.value!;
  const missing = GREEKS.filter((g) => g !== "iv" && greeks[g].value === null);
  if (missing.length) {
    const bs = blackScholes({ type, spot: ctx.spot, strike, years: ctx.years, vol: iv, rate: ctx.rate });
    // A Greek from a provided or price-implied IV is calculated; from an assumed IV it's only an estimate.
    const origin: Origin = greeks.iv.origin === "estimated" ? "estimated" : "calculated";
    for (const g of missing) greeks[g] = { value: bs[g as Exclude<GreekName, "iv">], origin };
  }
  return { ...s, price, basis, greeks, flags };
}

/** A raw chain from any source → the labelled chain every screen and the agent use. */
export function enrichChain(raw: RawChain, opts: { nowMs: number; rate?: number; /** Volatility to assume where the chain gives none (e.g. the underlying's recent volatility). */ assumedIv?: number }): OptionChain {
  const rate = opts.rate ?? DEFAULT_RATE;
  const rows = [...raw.rows].filter((r) => Number.isFinite(r.strike) && r.strike > 0).sort((a, b) => a.strike - b.strike);
  const days = daysToExpiry(raw.expiry, opts.nowMs);
  const expired = days <= 0;
  const spot = pos(raw.spot);
  const atmRow = spot && rows.length ? rows.reduce((b, r) => (Math.abs(r.strike - spot) < Math.abs(b.strike - spot) ? r : b)) : null;
  // The ATM volatility (source's, else implied from the ATM prices) stands in for contracts with no price.
  const atmIvOf = (side: RawSide, type: "CE" | "PE") => {
    if (pos(side.iv)) return side.iv!;
    const p = pos(side.bid) && pos(side.ask) ? (side.bid! + side.ask!) / 2 : pos(side.ltp);
    return p && spot && atmRow ? impliedVol(p, { type, spot, strike: atmRow.strike, years: daysToYears(days), rate }) : null;
  };
  const ivs = atmRow ? [atmIvOf(atmRow.call, "CE"), atmIvOf(atmRow.put, "PE")].filter((v): v is number => !!v && v > 0.005) : [];
  const atmIv = ivs.length ? ivs.reduce((a, b) => a + b, 0) / ivs.length : null;
  const ctx: SideCtx = { spot, years: daysToYears(days), rate, assumedIv: atmIv ?? opts.assumedIv ?? FALLBACK_IV, hasDepth: raw.hasDepth, expired, estimatePrices: raw.source.kind === "estimate" };
  const notices: ChainNotice[] = [];
  if (expired) notices.push("expired");
  else if (!marketOpen(opts.nowMs)) notices.push("market_closed");
  if (!spot) notices.push("no_spot");
  else if (raw.spotAt && spotIsStale(raw.spotAt * 1000, opts.nowMs)) notices.push("stale_spot");
  if (raw.source.kind === "estimate") notices.push("trial_estimates");
  return {
    ...raw,
    assumedIv: ctx.assumedIv,
    spot,
    daysToExpiry: days,
    asOf: Math.floor(opts.nowMs / 1000),
    rate,
    atmStrike: atmRow?.strike ?? null,
    atmIv,
    step: strikeStep(rows.map((r) => r.strike)),
    notices,
    rows: rows.map((r) => ({ strike: r.strike, call: enrichSide(r.call, "CE", r.strike, ctx), put: enrichSide(r.put, "PE", r.strike, ctx) })),
  };
}

/**
 * The underlying's price is out of date: older than the last session that should have closed (a
 * weekday 15:30 IST within the last 4 days — weekends and a holiday allowed), or over 15 minutes old
 * while the market is open.
 */
export function spotIsStale(spotMs: number, nowMs: number): boolean {
  if (marketOpen(nowMs)) return nowMs - spotMs > 15 * 60_000;
  // The most recent weekday close before now.
  let close = Date.parse(`${new Date(nowMs + 19_800_000).toISOString().slice(0, 10)}T15:30:00+05:30`);
  while (close > nowMs || [0, 6].includes(new Date(close + 19_800_000).getUTCDay())) close -= 86_400_000;
  // A holiday can skip one session, so allow a full day before that close.
  return spotMs < close - 86_400_000 - 6.25 * 3_600_000;
}

export type ChainQuery = {
  /** Strikes each side of the at-the-money strike; 0 = every strike (then paged). */
  window?: number;
  /** Only strikes in this range. */
  minStrike?: number;
  maxStrike?: number;
  /** Exactly one strike (the contract picker). */
  strike?: number;
  page?: number;
  size?: number;
};
export const CHAIN_PAGE_SIZES = [10, 25, 50, 100];

/** Server-side filtering and paging, so a 200-strike chain isn't sent whole to the browser. */
export function filterChain(chain: OptionChain, q: ChainQuery): { rows: ChainRow[]; total: number; page: number; pages: number; size: number } {
  let rows = chain.rows;
  if (q.strike !== undefined) rows = rows.filter((r) => r.strike === q.strike);
  if (q.minStrike !== undefined) rows = rows.filter((r) => r.strike >= q.minStrike!);
  if (q.maxStrike !== undefined) rows = rows.filter((r) => r.strike <= q.maxStrike!);
  const window = q.window ?? 12;
  if (q.strike === undefined && window > 0 && chain.atmStrike !== null) {
    const i = rows.findIndex((r) => r.strike === chain.atmStrike);
    if (i >= 0) rows = rows.slice(Math.max(0, i - window), i + window + 1);
  }
  const size = CHAIN_PAGE_SIZES.includes(q.size ?? 0) ? q.size! : 50;
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const page = Math.min(Math.max(1, Math.floor(q.page ?? 1)), pages);
  return { rows: rows.slice((page - 1) * size, page * size), total, page, pages, size };
}

/** Put–call ratio by open interest. */
export function chainPcr(rows: { call: { oi: number | null }; put: { oi: number | null } }[]): number | null {
  const c = rows.reduce((s, r) => s + (r.call.oi ?? 0), 0);
  const p = rows.reduce((s, r) => s + (r.put.oi ?? 0), 0);
  return c > 0 ? p / c : null;
}

export const FLAG_TEXT: Record<ContractFlag, string> = {
  expired: "Expired — this contract no longer trades.",
  no_price: "No price yet — nothing has traded and there's no bid or ask.",
  one_sided: "Only one side is quoted (a bid or an ask, not both) — you may not get filled near this price.",
  wide_spread: "Wide gap between bid and ask (over 10%) — a market order could fill far from the last price.",
  no_trades_today: "No trades today — the last price is from an earlier session.",
  no_activity: "No volume and no open interest — this contract is effectively untraded.",
};

export const NOTICE_TEXT: Record<ChainNotice, string> = {
  market_closed: "The market is closed — prices and Greeks are from the last session.",
  expired: "This expiry has passed — its contracts no longer trade.",
  no_spot: "The underlying's price isn't available, so Greeks couldn't be worked out.",
  stale_spot: "The underlying's latest price is out of date (a session or more behind), so these figures may be off.",
  trial_estimates: "Free trial: these prices are our estimates from the underlying's price and an assumed volatility, not live quotes. Connect your broker for live option prices and Greeks.",
};

/** Annualised volatility of daily closes over the last `days` sessions (the free trial's stand-in for IV). */
export function historicalVol(closes: number[], days = 20): number | null {
  const c = closes.slice(-(days + 1));
  if (c.length < 6) return null;
  const r = c.slice(1).map((x, i) => Math.log(x / c[i])).filter(Number.isFinite);
  const mean = r.reduce((a, b) => a + b, 0) / r.length;
  const v = r.reduce((a, b) => a + (b - mean) ** 2, 0) / (r.length - 1);
  const hv = Math.sqrt(v * 252);
  return Number.isFinite(hv) && hv > 0 ? hv : null;
}
