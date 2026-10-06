import type { EngineLimits, RiskLeg, RiskManagementConfig, RiskUnit, TargetLevel } from "./step";

// The trading system's risk options, stored as JSON on a strategy (and copied onto each backtest and forward test):
//  - TP/SL reference: PRICE (stops and targets are moves in the share's price) or MARGIN (they are returns on the
//    margin a leveraged intraday position uses — the engine turns them into the price moves that produce them);
//  - intraday leverage: how much position each rupee of capital carries (the price itself never changes);
//  - break-even: move the stop to the entry once price has moved this far in the position's favour;
//  - daily-loss and drawdown limits: stop opening new positions once losses reach them.

export type TpSlReference = "PRICE" | "MARGIN";

export interface RiskOptions {
  reference: TpSlReference;
  /** 1 = no leverage. Above 1 only for intraday. */
  leverage: number;
  breakEven: { unit: RiskUnit; value: number } | null;
  maxDailyLossPercent: number | null;
  maxDrawdownPercent: number | null;
}

export const DEFAULT_RISK_OPTIONS: RiskOptions = { reference: "PRICE", leverage: 1, breakEven: null, maxDailyLossPercent: null, maxDrawdownPercent: null };
/** The most leverage the platform accepts; brokers' own intraday limits are usually lower and vary by stock. */
export const MAX_LEVERAGE = 20;

const UNITS: RiskUnit[] = ["PERCENT", "POINTS", "ATR_MULTIPLE", "R_MULTIPLE"];
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Reads stored options defensively: anything malformed falls back to the default. */
export function parseRiskOptions(json: unknown): RiskOptions {
  const o = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  const be = o.breakEven as { unit?: unknown; value?: unknown } | null | undefined;
  const lev = num(o.leverage);
  return {
    reference: o.reference === "MARGIN" ? "MARGIN" : "PRICE",
    leverage: lev && lev >= 1 && lev <= MAX_LEVERAGE ? lev : 1,
    breakEven: be && UNITS.includes(be.unit as RiskUnit) && num(be.value) && (be.value as number) > 0 ? { unit: be.unit as RiskUnit, value: be.value as number } : null,
    maxDailyLossPercent: num(o.maxDailyLossPercent) && (o.maxDailyLossPercent as number) > 0 ? (o.maxDailyLossPercent as number) : null,
    maxDrawdownPercent: num(o.maxDrawdownPercent) && (o.maxDrawdownPercent as number) > 0 ? (o.maxDrawdownPercent as number) : null,
  };
}

/** True when nothing differs from the defaults (stored as null). */
export const isDefaultRiskOptions = (o: RiskOptions) => o.reference === "PRICE" && o.leverage === 1 && !o.breakEven && o.maxDailyLossPercent == null && o.maxDrawdownPercent == null;

/** Why these options can't be used with this strategy, or null when they're fine. */
export function riskOptionsProblem(o: RiskOptions, ctx: { productType: string; stopLossOn: boolean }): string | null {
  if (!(o.leverage >= 1) || o.leverage > MAX_LEVERAGE) return `Leverage must be between 1× and ${MAX_LEVERAGE}×.`;
  if (o.leverage > 1 && ctx.productType !== "INTRADAY") return "Leverage applies only to intraday positions. Choose the intraday product, or set leverage to 1×.";
  if (o.reference === "MARGIN" && o.leverage === 1) return "Margin-based stops and targets need leverage above 1× (at 1× the margin is the whole position, so it's the same as price-based).";
  if (o.breakEven && o.breakEven.unit === "R_MULTIPLE" && !ctx.stopLossOn) return "A break-even set in R needs a stop-loss (R is the stop-loss distance).";
  if (o.breakEven && !(o.breakEven.value > 0)) return "The break-even trigger needs a distance above zero.";
  if (o.maxDailyLossPercent != null && (o.maxDailyLossPercent <= 0 || o.maxDailyLossPercent > 100)) return "The daily loss limit must be between 0% and 100%.";
  if (o.maxDrawdownPercent != null && (o.maxDrawdownPercent <= 0 || o.maxDrawdownPercent > 100)) return "The drawdown limit must be between 0% and 100%.";
  return null;
}

/**
 * Margin-based → price-based: a percentage of the margin is that percentage divided by the leverage in the price.
 * (5× leverage, 10% on margin = a 2% price move.) Points, ATR and R-multiple distances are already in price terms.
 */
function leg<T extends { unit: RiskUnit; value: number }>(l: T, o: RiskOptions): T {
  return o.reference === "MARGIN" && o.leverage > 1 && l.unit === "PERCENT" ? { ...l, value: l.value / o.leverage } : l;
}

/** The engine's risk settings in price terms, plus the leverage and limits — what every engine path runs with. */
export function engineRisk(rm: RiskManagementConfig, o: RiskOptions): { riskManagement: RiskManagementConfig; leverage: number; limits?: EngineLimits } {
  const l = (x: RiskLeg | null) => (x ? leg(x, o) : x);
  const targets = rm.targets?.map((t): TargetLevel => ({ ...leg(t, o), lock: t.lock.mode === "MARGIN" || t.lock.mode === "TRAIL" ? leg(t.lock, o) : t.lock }));
  const riskManagement: RiskManagementConfig = {
    stopLoss: l(rm.stopLoss),
    target: l(rm.target),
    trailingSl: l(rm.trailingSl),
    ...(targets?.length ? { targets } : {}),
    ...(o.breakEven ? { breakEven: leg({ enabled: true, ...o.breakEven }, o) } : {}),
  };
  const limits = o.maxDailyLossPercent != null || o.maxDrawdownPercent != null ? { maxDailyLossPercent: o.maxDailyLossPercent, maxDrawdownPercent: o.maxDrawdownPercent } : undefined;
  return { riskManagement, leverage: o.leverage, ...(limits ? { limits } : {}) };
}

/** Every figure a user needs to see what a stop or target means: shown beside the settings (pure, for the preview). */
export interface RiskExample {
  entry: number;
  quantity: number;
  leverage: number;
  exposure: number;
  margin: number;
  stopPrice: number | null;
  targetPrice: number | null;
  /** ₹ lost at the stop / made at the target for the whole position. */
  stopPnl: number | null;
  targetPnl: number | null;
  /** The same as a % of the margin used, and as a % of the price. */
  stopPctOfMargin: number | null;
  targetPctOfMargin: number | null;
  stopPctOfPrice: number | null;
  targetPctOfPrice: number | null;
}

/** Works out the example for a long position (a short is the mirror image; the sizes are the same). */
export function riskExample(input: { entry: number; capital: number; stop: RiskLeg | null; target: RiskLeg | null; options: RiskOptions; quantity?: number }): RiskExample {
  const { entry, capital, options } = input;
  const lev = options.leverage > 1 ? options.leverage : 1;
  const quantity = input.quantity ?? Math.max(1, Math.floor((capital * lev) / entry));
  const exposure = quantity * entry;
  const margin = exposure / lev;
  const priceDist = (l: RiskLeg | null, stopDist: number | null) => {
    if (!l?.enabled) return null;
    const p = leg(l, options);
    switch (p.unit) {
      case "PERCENT":
        return (entry * p.value) / 100;
      case "POINTS":
        return p.value;
      case "R_MULTIPLE":
        return stopDist != null ? p.value * stopDist : null;
      default:
        return null; // ATR: known only at entry
    }
  };
  const sd = priceDist(input.stop, null);
  const td = priceDist(input.target, sd);
  const pct = (rupees: number | null, base: number) => (rupees == null || !base ? null : Math.round((rupees / base) * 10000) / 100);
  const stopPnl = sd == null ? null : -sd * quantity;
  const targetPnl = td == null ? null : td * quantity;
  return {
    entry,
    quantity,
    leverage: lev,
    exposure,
    margin,
    stopPrice: sd == null ? null : Math.round((entry - sd) * 100) / 100,
    targetPrice: td == null ? null : Math.round((entry + td) * 100) / 100,
    stopPnl,
    targetPnl,
    stopPctOfMargin: pct(stopPnl, margin),
    targetPctOfMargin: pct(targetPnl, margin),
    stopPctOfPrice: sd == null ? null : -Math.round((sd / entry) * 10000) / 100,
    targetPctOfPrice: td == null ? null : Math.round((td / entry) * 10000) / 100,
  };
}

/** The options in a few plain words each (empty when they're all the defaults). */
export function describeRiskOptions(o: RiskOptions): string[] {
  const out: string[] = [];
  if (o.leverage > 1) out.push(`${o.leverage}× intraday leverage`);
  if (o.reference === "MARGIN") out.push(`% stops and targets measured on margin (÷${o.leverage} in price)`);
  if (o.breakEven) out.push(`stop to breakeven after ${o.breakEven.unit === "PERCENT" ? `${o.breakEven.value}%` : o.breakEven.unit === "POINTS" ? `${o.breakEven.value} pts` : o.breakEven.unit === "R_MULTIPLE" ? `${o.breakEven.value}R` : `${o.breakEven.value}× ATR`} in favour`);
  if (o.maxDailyLossPercent != null) out.push(`no new positions after a ${o.maxDailyLossPercent}% daily loss`);
  if (o.maxDrawdownPercent != null) out.push(`halts after a ${o.maxDrawdownPercent}% drawdown`);
  return out;
}
