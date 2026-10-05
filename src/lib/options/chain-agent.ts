import { chainPcr, FLAG_TEXT, GREEKS, NOTICE_TEXT, type ChainSide, type OptionChain } from "./chain";

// What the assistant's get_option_chain tool returns: the chain in brief, or one contract in full —
// always with where each figure came from, so it can say "from your Groww account" vs "our estimate".

const r = (n: number | null | undefined, d = 2) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 10 ** d) / 10 ** d);

function contract(q: ChainSide) {
  return {
    price: r(q.price),
    price_basis: q.basis, // mid of bid/ask, last trade, or our estimate
    bid: r(q.bid),
    ask: r(q.ask),
    last_traded: r(q.ltp),
    volume: q.volume,
    open_interest: q.oi,
    greeks: Object.fromEntries(GREEKS.map((g) => [g === "iv" ? "iv_pct" : g, { value: r(g === "iv" ? (q.greeks[g].value ?? NaN) * 100 : q.greeks[g].value, g === "gamma" ? 5 : 3), origin: q.greeks[g].origin }])),
    warnings: q.flags.map((f) => FLAG_TEXT[f]),
  };
}

export function chainForAgent(
  chain: OptionChain,
  expiries: string[],
  brokerIssues: { name: string; reason: string }[],
  pick?: { strike?: number; type?: "CE" | "PE" },
) {
  const source = chain.source.kind === "broker" ? `the user's own ${chain.source.name} account` : chain.source.kind === "feed" ? chain.source.name : "free-trial estimates (no live option prices: the user hasn't connected a broker that gives option data)";
  const base = {
    underlying: chain.underlying,
    expiry: chain.expiry,
    other_expiries: expiries.filter((e) => e !== chain.expiry).slice(0, 5),
    source,
    notices: chain.notices.map((n) => NOTICE_TEXT[n]),
    broker_issues: brokerIssues.map((i) => `${i.name}: ${i.reason}`),
    spot: r(chain.spot),
    days_to_expiry: r(chain.daysToExpiry, 2),
    lot_size: chain.lotSize,
    atm_strike: chain.atmStrike,
    atm_iv_pct: r(chain.atmIv === null ? null : chain.atmIv * 100, 1),
    origin_meaning: "provided = given by the data source; calculated = worked out by MyAlgoAgent (Black–Scholes) from that contract's own price; estimated = from an assumed volatility because the contract has no usable price",
  };
  if (pick?.strike !== undefined) {
    const row = chain.rows.find((x) => x.strike === pick.strike);
    if (!row) {
      const near = chain.rows.map((x) => x.strike).sort((a, b) => Math.abs(a - pick.strike!) - Math.abs(b - pick.strike!)).slice(0, 4);
      return { ...base, error: `No ${pick.strike} strike for this expiry. Nearest listed: ${near.join(", ")}.` };
    }
    const sides = pick.type ? { [pick.type === "CE" ? "call" : "put"]: contract(pick.type === "CE" ? row.call : row.put) } : { call: contract(row.call), put: contract(row.put) };
    return { ...base, strike: row.strike, ...sides, rate_pct_used: r(chain.rate * 100, 1) };
  }
  const i = chain.rows.findIndex((x) => x.strike === chain.atmStrike);
  const near = chain.rows.slice(Math.max(0, (i < 0 ? Math.floor(chain.rows.length / 2) : i) - 5), (i < 0 ? Math.floor(chain.rows.length / 2) : i) + 6);
  const brief = (q: ChainSide) => ({ price: r(q.price), oi: q.oi, iv_pct: r(q.greeks.iv.value === null ? null : q.greeks.iv.value * 100, 1), delta: r(q.greeks.delta.value, 3), origin: q.greeks.delta.origin, warn: q.flags.length ? q.flags : undefined });
  return {
    ...base,
    pcr_oi: chain.source.kind === "estimate" ? null : r(chainPcr(chain.rows)),
    strikes: near.map((x) => ({ strike: x.strike, call: brief(x.call), put: brief(x.put) })),
    note: "For one contract's full Greeks (incl. rho) call again with strike (and type CE/PE).",
  };
}
