// Black–Scholes pricing and Greeks for European options (NSE index and stock
// options are European-style). Pure maths — no data source involved — so it
// works on typed-in numbers today and on the live option chain later.
//
// Conventions: time in years (calendar days / 365), rates and volatility as
// decimals (0.065 = 6.5%), no dividends. Theta is per calendar day and vega
// per 1 volatility point, the way traders quote them.

export type OptionType = "CE" | "PE"; // NSE naming: call (CE) / put (PE)

export type OptionInputs = {
  type: OptionType;
  spot: number;
  strike: number;
  /** Years to expiry (calendar days / 365). */
  years: number;
  /** Annualised volatility, e.g. 0.18 for 18%. */
  vol: number;
  /** Annual risk-free rate, e.g. 0.065. */
  rate: number;
};

export type Greeks = { price: number; delta: number; gamma: number; theta: number; vega: number; rho: number };

/** Standard normal cumulative distribution (Abramowitz–Stegun 26.2.17, |error| < 7.5e-8). */
export function normCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp((-x * x) / 2);
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}

export function normPdf(x: number): number {
  return 0.3989422804014327 * Math.exp((-x * x) / 2);
}

/** Price and Greeks. At or past expiry (or with zero volatility) the option is worth its intrinsic value. */
export function blackScholes({ type, spot, strike, years, vol, rate }: OptionInputs): Greeks {
  const intrinsic = type === "CE" ? Math.max(spot - strike, 0) : Math.max(strike - spot, 0);
  if (years <= 0 || vol <= 0 || spot <= 0 || strike <= 0) {
    const itm = intrinsic > 0;
    return { price: intrinsic, delta: itm ? (type === "CE" ? 1 : -1) : 0, gamma: 0, theta: 0, vega: 0, rho: 0 };
  }
  const sqrtT = Math.sqrt(years);
  const d1 = (Math.log(spot / strike) + (rate + (vol * vol) / 2) * years) / (vol * sqrtT);
  const d2 = d1 - vol * sqrtT;
  const disc = Math.exp(-rate * years);
  const pdf = normPdf(d1);

  const price = type === "CE" ? spot * normCdf(d1) - strike * disc * normCdf(d2) : strike * disc * normCdf(-d2) - spot * normCdf(-d1);
  const delta = type === "CE" ? normCdf(d1) : normCdf(d1) - 1;
  const gamma = pdf / (spot * vol * sqrtT);
  const thetaYear =
    type === "CE"
      ? (-spot * pdf * vol) / (2 * sqrtT) - rate * strike * disc * normCdf(d2)
      : (-spot * pdf * vol) / (2 * sqrtT) + rate * strike * disc * normCdf(-d2);
  const vega = (spot * pdf * sqrtT) / 100;
  const rho = (type === "CE" ? strike * years * disc * normCdf(d2) : -strike * years * disc * normCdf(-d2)) / 100;

  return { price: Math.max(price, 0), delta, gamma, theta: thetaYear / 365, vega, rho };
}

/**
 * Implied volatility from a market price (bisection — slow but never fails to
 * converge). Returns null when the price is outside what any volatility can
 * produce (below intrinsic value or above the no-arbitrage bound).
 */
export function impliedVol(price: number, inputs: Omit<OptionInputs, "vol">): number | null {
  const at = (vol: number) => blackScholes({ ...inputs, vol }).price;
  let lo = 0.0001;
  let hi = 5; // 500%
  if (price < at(lo) - 1e-6 || price > at(hi) + 1e-6) return null;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (at(mid) < price) lo = mid;
    else hi = mid;
    if (hi - lo < 1e-7) break;
  }
  return (lo + hi) / 2;
}

/** Calendar days → years. */
export const daysToYears = (days: number) => Math.max(days, 0) / 365;
