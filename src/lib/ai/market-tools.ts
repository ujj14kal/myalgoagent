import "server-only";
import { prisma } from "@/lib/prisma";
import { marketDataFor, marketExtrasFor, maxPain, pcr } from "@/lib/market-data";
import { loadBrokerAccount } from "@/lib/brokers/account-load";

// Read-only market and account lookups for the assistant. Everything goes
// through the same selectors as the pages (licensed feed only for allowed
// accounts, Yahoo otherwise), so the assistant sees exactly what the user sees.

const round = (n: number | null | undefined, d = 2) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 10 ** d) / 10 ** d);
const INDEX_ALIASES: Record<string, string> = { NIFTY: "^NSEI", "NIFTY 50": "^NSEI", NIFTY50: "^NSEI", BANKNIFTY: "^NSEBANK", "NIFTY BANK": "^NSEBANK", SENSEX: "^BSESN", "NIFTY IT": "^CNXIT", NIFTYIT: "^CNXIT" };

async function instrumentFor(raw: string) {
  const s = raw.trim().toUpperCase();
  const symbol = INDEX_ALIASES[s] ?? (s.startsWith("^") || s.endsWith(".NS") ? s : `${s}.NS`);
  return prisma.instrument.findUnique({ where: { symbol }, select: { symbol: true, name: true } });
}

/** Last price, day change and ranges for one instrument. */
export async function getQuote(userId: string, raw: string) {
  const inst = await instrumentFor(raw);
  if (!inst) return { error: `Unknown instrument "${raw}" — search with list_instruments.` };
  const market = marketDataFor(userId, "view");
  const extras = marketExtrasFor(userId);
  const [daily, ticks, week52] = await Promise.all([
    market.getHistoricalCandles(inst.symbol, "1mo", "1d"),
    market.getRecentTicks?.(inst.symbol, 1).catch(() => []) ?? Promise.resolve([]),
    extras?.week52(inst.symbol).catch(() => null) ?? Promise.resolve(null),
  ]);
  const dayOf = (t: number) => new Date((t + 19_800) * 1000).toISOString().slice(0, 10);
  const tick = ticks.at(-1);
  const last = tick?.price ?? daily.at(-1)?.close ?? null;
  const priceDay = tick ? dayOf(tick.time) : daily.at(-1) ? dayOf(daily.at(-1)!.time) : null;
  const prev = [...daily].reverse().find((c) => priceDay && dayOf(c.time) < priceDay)?.close ?? null;
  const today = daily.at(-1) && priceDay && dayOf(daily.at(-1)!.time) === priceDay ? daily.at(-1)! : null;
  return {
    symbol: inst.symbol,
    name: inst.name,
    last: round(last),
    as_of: tick ? new Date(tick.time * 1000).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) + " IST (live)" : priceDay ? `${priceDay} close` : null,
    change_pct: last && prev ? round(((last - prev) / prev) * 100) : null,
    previous_close: round(prev),
    day_high: round(today?.high),
    day_low: round(today?.low),
    bid: round(tick?.bid),
    ask: round(tick?.ask),
    week52,
    month_range: daily.length ? { high: round(Math.max(...daily.map((c) => c.high))), low: round(Math.min(...daily.map((c) => c.low))) } : null,
    source: market.name,
  };
}

/** Today's market snapshot: breadth, movers, most traded — live-data accounts only. */
export async function getMarketOverview(userId: string) {
  const extras = marketExtrasFor(userId);
  const indices = await Promise.all(["^NSEI", "^NSEBANK", "^CNXIT", "^BSESN"].map((s) => getQuote(userId, s).catch(() => null)));
  const idx = indices.flatMap((q) => (q && !("error" in q) ? [{ name: q.name, last: q.last, change_pct: q.change_pct }] : []));
  if (!extras) return { indices: idx, note: "Movers, breadth and most-traded lists need live market data, which isn't enabled for this account." };
  const [gainers, losers, active, breadth, breadthAll] = await Promise.all([
    extras.movers("gainers", 8).catch(() => []),
    extras.movers("losers", 8).catch(() => []),
    extras.mostActive("turnover", 8).catch(() => []),
    extras.breadth("NIFTY 50").catch(() => null),
    extras.breadth("NIFTY TOTAL MARKET").catch(() => null),
  ]);
  const short = (m: { symbol: string; changePct: number | null }) => ({ symbol: m.symbol.replace(/\.NS$/, ""), change_pct: round(m.changePct) });
  return {
    indices: idx,
    breadth_nifty50: breadth,
    breadth_total_market: breadthAll,
    top_gainers: gainers.map(short),
    top_losers: losers.map(short),
    most_traded_by_value: active.map((a) => ({ ...short(a), turnover_cr: round((a.turnover ?? 0) / 1e7, 1) })),
  };
}

/** An option chain in brief: spot, PCR, max pain, ATM IV and strikes around the money — live-data accounts only. */
export async function getOptionChainSummary(userId: string, underlyingRaw: string, expiry?: string) {
  const extras = marketExtrasFor(userId);
  if (!extras) return { error: "Option chains need live market data, which isn't enabled for this account." };
  const underlying = underlyingRaw.trim().toUpperCase().replace(/^NIFTY 50$/, "NIFTY").replace(/^NIFTY BANK$/, "BANKNIFTY");
  const expiries = await extras.expiries(underlying);
  if (!expiries.length) return { error: `${underlying} has no listed options.` };
  const exp = expiry && expiries.includes(expiry) ? expiry : expiries[0];
  const rows = await extras.optionChain(underlying, exp);
  const spotQuote = await getQuote(userId, underlying === "NIFTY" ? "^NSEI" : underlying === "BANKNIFTY" ? "^NSEBANK" : underlying).catch(() => null);
  const spot = spotQuote && !("error" in spotQuote) ? spotQuote.last : null;
  const atmIdx = spot ? rows.reduce((b, r, i) => (Math.abs(r.strike - spot) < Math.abs(rows[b].strike - spot) ? i : b), 0) : Math.floor(rows.length / 2);
  const near = rows.slice(Math.max(0, atmIdx - 5), atmIdx + 6);
  return {
    underlying,
    expiry: exp,
    other_expiries: expiries.slice(1, 5),
    spot,
    pcr_oi: round(pcr(rows)),
    max_pain: maxPain(rows),
    atm_strike: rows[atmIdx]?.strike ?? null,
    atm_iv_pct: round(((rows[atmIdx]?.call.iv ?? 0) + (rows[atmIdx]?.put.iv ?? 0)) * 50, 1),
    strikes: near.map((r) => ({ strike: r.strike, call_ltp: r.call.ltp, call_oi: r.call.oi, call_iv_pct: round((r.call.iv ?? 0) * 100, 1), put_ltp: r.put.ltp, put_oi: r.put.oi, put_iv_pct: round((r.put.iv ?? 0) * 100, 1) })),
  };
}

/** The user's broker account as their broker reports it (read-only). */
export async function getBrokerAccount(userId: string, broker?: string) {
  const now = new Date();
  const conns = await prisma.brokerConnection.findMany({ where: { userId, status: "CONNECTED", tokenExpiresAt: { gt: now } }, select: { broker: true } });
  const chosen = broker ? conns.find((c) => c.broker === broker.toLowerCase())?.broker : conns[0]?.broker;
  if (!chosen) return { error: conns.length ? `Not connected to ${broker} today.` : "No broker is connected for today — point the user to Broker Connections." };
  const acct = await loadBrokerAccount(userId, chosen);
  if ("error" in acct) return { error: acct.error };
  const ok = <T,>(s: { ok: true; data: T } | { ok: false; error: string } | null) => (s === null ? null : s.ok ? s.data : { error: s.error });
  const holdings = ok(acct.holdings);
  const positions = ok(acct.positions);
  const orders = ok(acct.orders);
  return {
    broker: acct.name,
    connected_brokers: conns.map((c) => c.broker),
    funds: ok(acct.funds),
    holdings: Array.isArray(holdings) ? holdings.slice(0, 40) : holdings,
    holdings_count: Array.isArray(holdings) ? holdings.length : null,
    positions,
    todays_orders: Array.isArray(orders) ? orders.slice(0, 30) : orders,
    note: "Read-only, as the broker reports it right now. Describe it; don't recommend trades.",
  };
}
