import { blackScholes, daysToYears, type Greeks, type OptionType } from "./black-scholes";

// Multi-leg options positions: payoff at expiry, value today, breakevens,
// max profit/loss and combined Greeks. Pure maths over the legs — premiums,
// IV and lot sizes come from the user today and from the live option chain
// once a data feed is connected.

export type Side = "BUY" | "SELL";

export type OptionLeg = {
  kind: "OPTION";
  type: OptionType;
  side: Side;
  strike: number;
  /** Price paid (buy) or received (sell) per unit. */
  premium: number;
  lots: number;
  lotSize: number;
  /** Calendar days to this leg's expiry (legs may expire on different dates). */
  expiryDays: number;
  /** Implied volatility, e.g. 0.16, used for the value before expiry and the Greeks. */
  iv: number;
};

export type FutureLeg = { kind: "FUTURE"; side: Side; price: number; lots: number; lotSize: number };

export type Leg = OptionLeg | FutureLeg;

const sign = (s: Side) => (s === "BUY" ? 1 : -1);
const units = (l: Leg) => l.lots * l.lotSize;

/** P&L of one leg if the underlying settles at `S` on expiry (premium included). */
function legPayoff(l: Leg, S: number): number {
  if (l.kind === "FUTURE") return sign(l.side) * (S - l.price) * units(l);
  const intrinsic = l.type === "CE" ? Math.max(S - l.strike, 0) : Math.max(l.strike - S, 0);
  return sign(l.side) * (intrinsic - l.premium) * units(l);
}

/** Total P&L at expiry for an underlying price `S`. */
export function payoffAtExpiry(legs: Leg[], S: number): number {
  return legs.reduce((sum, l) => sum + legPayoff(l, S), 0);
}

/**
 * Total P&L if the underlying were at `S` after `daysPassed` days, valuing
 * unexpired options with Black–Scholes at each leg's IV.
 */
export function payoffNow(legs: Leg[], S: number, rate: number, daysPassed = 0): number {
  return legs.reduce((sum, l) => {
    if (l.kind === "FUTURE") return sum + legPayoff(l, S);
    const value = blackScholes({ type: l.type, spot: S, strike: l.strike, years: daysToYears(l.expiryDays - daysPassed), vol: l.iv, rate }).price;
    return sum + sign(l.side) * (value - l.premium) * units(l);
  }, 0);
}

/** Combined Greeks of the position, in rupees per unit move (delta, gamma), per day (theta) and per vol point (vega). */
export function positionGreeks(legs: Leg[], spot: number, rate: number): Omit<Greeks, "price"> {
  const total = { delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 };
  for (const l of legs) {
    const q = sign(l.side) * units(l);
    if (l.kind === "FUTURE") {
      total.delta += q;
      continue;
    }
    const g = blackScholes({ type: l.type, spot, strike: l.strike, years: daysToYears(l.expiryDays), vol: l.iv, rate });
    total.delta += g.delta * q;
    total.gamma += g.gamma * q;
    total.theta += g.theta * q;
    total.vega += g.vega * q;
    total.rho += g.rho * q;
  }
  return total;
}

export type PositionSummary = {
  /** Premium paid (negative) or received (positive) when opening, in ₹. */
  netPremium: number;
  /** null = unlimited. */
  maxProfit: number | null;
  maxLoss: number | null;
  breakevens: number[];
};

/**
 * Exact expiry analysis. The expiry payoff is piecewise linear with kinks only
 * at strikes, so evaluating the kinks plus the slopes beyond them gives exact
 * breakevens and max profit/loss — no grid approximation.
 */
export function summarize(legs: Leg[]): PositionSummary {
  const netPremium = legs.reduce((s, l) => (l.kind === "OPTION" ? s - sign(l.side) * l.premium * units(l) : s), 0);
  const kinks = [...new Set(legs.flatMap((l) => (l.kind === "OPTION" ? [l.strike] : [])))].sort((a, b) => a - b);
  const top = (kinks.at(-1) ?? legs.find((l) => l.kind === "FUTURE")?.price ?? 100) * 2 + 1;
  const points = [0, ...kinks, top];
  const values = points.map((S) => payoffAtExpiry(legs, S));

  // Slope beyond the highest strike: calls and futures keep adding/removing value.
  const slopeUp = legs.reduce((s, l) => (l.kind === "FUTURE" || l.type === "CE" ? s + sign(l.side) * units(l) : s), 0);
  const eps = 1e-9;
  const maxProfit = slopeUp > eps ? null : Math.max(...values);
  const maxLoss = slopeUp < -eps ? null : Math.min(...values);

  const breakevens: number[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [a, b] = [values[i], values[i + 1]];
    if (a === 0 && (i === 0 || values[i - 1] !== 0)) breakevens.push(points[i]);
    if ((a < 0 && b > 0) || (a > 0 && b < 0)) breakevens.push(points[i] + ((points[i + 1] - points[i]) * -a) / (b - a));
  }
  return {
    netPremium,
    maxProfit,
    maxLoss,
    breakevens: breakevens.filter((b) => b > 0).map((b) => Math.round(b * 100) / 100),
  };
}

// ---------- strike selection & ready-made strategies ----------

/** The strike nearest the spot on a strike grid of `step` (e.g. 50 for NIFTY). */
export function atmStrike(spot: number, step: number): number {
  return Math.round(spot / step) * step;
}

type TemplateLeg = { type: OptionType; side: Side; offset: number };

/** Classic strategies as legs relative to the ATM strike (offset in strike steps). */
export const STRATEGY_TEMPLATES: { id: string; label: string; view: string; legs: TemplateLeg[] }[] = [
  { id: "long-call", label: "Long Call", view: "Bullish", legs: [{ type: "CE", side: "BUY", offset: 0 }] },
  { id: "long-put", label: "Long Put", view: "Bearish", legs: [{ type: "PE", side: "BUY", offset: 0 }] },
  { id: "short-put", label: "Short Put", view: "Mildly bullish", legs: [{ type: "PE", side: "SELL", offset: 0 }] },
  { id: "short-call", label: "Short Call", view: "Mildly bearish", legs: [{ type: "CE", side: "SELL", offset: 0 }] },
  { id: "bull-call-spread", label: "Bull Call Spread", view: "Bullish, limited risk", legs: [{ type: "CE", side: "BUY", offset: 0 }, { type: "CE", side: "SELL", offset: 2 }] },
  { id: "bear-put-spread", label: "Bear Put Spread", view: "Bearish, limited risk", legs: [{ type: "PE", side: "BUY", offset: 0 }, { type: "PE", side: "SELL", offset: -2 }] },
  { id: "long-straddle", label: "Long Straddle", view: "Big move either way", legs: [{ type: "CE", side: "BUY", offset: 0 }, { type: "PE", side: "BUY", offset: 0 }] },
  { id: "short-straddle", label: "Short Straddle", view: "Range-bound", legs: [{ type: "CE", side: "SELL", offset: 0 }, { type: "PE", side: "SELL", offset: 0 }] },
  { id: "long-strangle", label: "Long Strangle", view: "Big move either way", legs: [{ type: "CE", side: "BUY", offset: 2 }, { type: "PE", side: "BUY", offset: -2 }] },
  { id: "short-strangle", label: "Short Strangle", view: "Range-bound", legs: [{ type: "CE", side: "SELL", offset: 2 }, { type: "PE", side: "SELL", offset: -2 }] },
  {
    id: "iron-condor",
    label: "Iron Condor",
    view: "Range-bound, limited risk",
    legs: [
      { type: "PE", side: "BUY", offset: -4 },
      { type: "PE", side: "SELL", offset: -2 },
      { type: "CE", side: "SELL", offset: 2 },
      { type: "CE", side: "BUY", offset: 4 },
    ],
  },
  {
    id: "iron-butterfly",
    label: "Iron Butterfly",
    view: "Range-bound, limited risk",
    legs: [
      { type: "PE", side: "BUY", offset: -3 },
      { type: "PE", side: "SELL", offset: 0 },
      { type: "CE", side: "SELL", offset: 0 },
      { type: "CE", side: "BUY", offset: 3 },
    ],
  },
];

/**
 * Legs for a template at the current spot. Without a live option chain the
 * premiums are theoretical (Black–Scholes at the given IV) — clearly an
 * estimate; with a feed they'll come from real quotes.
 */
export function buildTemplate(
  templateId: string,
  p: { spot: number; step: number; expiryDays: number; iv: number; rate: number; lots: number; lotSize: number },
): OptionLeg[] {
  const t = STRATEGY_TEMPLATES.find((x) => x.id === templateId);
  if (!t) return [];
  const atm = atmStrike(p.spot, p.step);
  return t.legs.map((l) => {
    const strike = atm + l.offset * p.step;
    const theo = blackScholes({ type: l.type, spot: p.spot, strike, years: daysToYears(p.expiryDays), vol: p.iv, rate: p.rate }).price;
    return {
      kind: "OPTION" as const,
      type: l.type,
      side: l.side,
      strike,
      premium: Math.max(0.05, Math.round(theo * 20) / 20), // NSE tick size ₹0.05
      lots: p.lots,
      lotSize: p.lotSize,
      expiryDays: p.expiryDays,
      iv: p.iv,
    };
  });
}
