import type { EngineLimits, RiskBasis, RiskLeg, RiskManagementConfig, RiskUnit } from "./step";

// The trading system's risk options, stored as JSON on a strategy (and copied onto each backtest and forward test):
//  - TP/SL reference: PRICE (stops and targets are moves in the share's price) or CAPITAL (a % leg is that % of the
//    capital won or lost on the trade, a points leg a ₹ amount — the engine turns them into the price move that
//    produces that P&L for the position's size);
//  - intraday leverage: how much position each rupee of capital carries (the price itself never changes);
//  - break-even: move the stop to the entry once price has moved this far in the position's favour;
//  - daily-loss and drawdown limits: stop opening new positions once losses reach them.

export type TpSlReference = "PRICE" | "CAPITAL";

export interface RiskOptions {
  reference: TpSlReference;
  /** 1 = no leverage. Above 1 only for intraday. */
  leverage: number;
  breakEven: { unit: RiskUnit; value: number } | null;
  maxDailyLossPercent: number | null;
  maxDrawdownPercent: number | null;
  /** The most of the capital (× leverage) one position may use, in %; null = all of it. */
  maxCapitalUsePercent?: number | null;
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
    // "MARGIN" is the earlier name of CAPITAL.
    reference: o.reference === "CAPITAL" || o.reference === "MARGIN" ? "CAPITAL" : "PRICE",
    leverage: lev && lev >= 1 && lev <= MAX_LEVERAGE ? lev : 1,
    breakEven: be && UNITS.includes(be.unit as RiskUnit) && num(be.value) && (be.value as number) > 0 ? { unit: be.unit as RiskUnit, value: be.value as number } : null,
    maxDailyLossPercent: num(o.maxDailyLossPercent) && (o.maxDailyLossPercent as number) > 0 ? (o.maxDailyLossPercent as number) : null,
    maxDrawdownPercent: num(o.maxDrawdownPercent) && (o.maxDrawdownPercent as number) > 0 ? (o.maxDrawdownPercent as number) : null,
    ...(num(o.maxCapitalUsePercent) && (o.maxCapitalUsePercent as number) > 0 && (o.maxCapitalUsePercent as number) < 100 ? { maxCapitalUsePercent: o.maxCapitalUsePercent as number } : {}),
  };
}

/** True when nothing differs from the defaults (stored as null). */
export const isDefaultRiskOptions = (o: RiskOptions) => o.reference === "PRICE" && o.leverage === 1 && !o.breakEven && o.maxDailyLossPercent == null && o.maxDrawdownPercent == null && o.maxCapitalUsePercent == null;

/** Why these options can't be used with this strategy, or null when they're fine. */
export function riskOptionsProblem(o: RiskOptions, ctx: { productType: string; stopLossOn: boolean; sizingMode?: string }): string | null {
  if (!(o.leverage >= 1) || o.leverage > MAX_LEVERAGE) return `Leverage must be between 1× and ${MAX_LEVERAGE}×.`;
  if (o.leverage > 1 && ctx.productType !== "INTRADAY") return "Leverage applies only to intraday positions. Choose the intraday product, or set leverage to 1×.";
  if (o.reference === "CAPITAL" && ctx.sizingMode === "RISK_PERCENT") return "Sizing by risk works out the shares from a stop-loss measured on the share's price, so it can't be combined with a stop-loss measured on capital. Measure the stop-loss on the share price, or choose another way to size the position.";
  if (o.breakEven && o.breakEven.unit === "R_MULTIPLE" && !ctx.stopLossOn) return "A break-even set in R needs a stop-loss (R is the stop-loss distance).";
  if (o.breakEven && !(o.breakEven.value > 0)) return "The break-even trigger needs a distance above zero.";
  if (o.maxDailyLossPercent != null && (o.maxDailyLossPercent <= 0 || o.maxDailyLossPercent > 100)) return "The daily loss limit must be between 0% and 100%.";
  if (o.maxDrawdownPercent != null && (o.maxDrawdownPercent <= 0 || o.maxDrawdownPercent > 100)) return "The drawdown limit must be between 0% and 100%.";
  if (o.maxCapitalUsePercent != null && (o.maxCapitalUsePercent <= 0 || o.maxCapitalUsePercent > 100)) return "The most capital one position may use must be between 1% and 100%.";
  return null;
}

/** The engine's risk settings, plus what the legs are measured on, the leverage and the limits — what every engine path runs with. */
export function engineRisk(rm: RiskManagementConfig, o: RiskOptions): { riskManagement: RiskManagementConfig; riskBasis: RiskBasis; leverage: number; limits?: EngineLimits; maxCapitalUsePercent: number | null } {
  const riskManagement: RiskManagementConfig = { ...rm, ...(o.breakEven ? { breakEven: { enabled: true, ...o.breakEven } } : {}) };
  const limits = o.maxDailyLossPercent != null || o.maxDrawdownPercent != null ? { maxDailyLossPercent: o.maxDailyLossPercent, maxDrawdownPercent: o.maxDrawdownPercent } : undefined;
  return { riskManagement, riskBasis: o.reference === "CAPITAL" ? "CAPITAL" : "PRICE", leverage: o.leverage, ...(limits ? { limits } : {}), maxCapitalUsePercent: o.maxCapitalUsePercent ?? null };
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
  const onCapital = options.reference === "CAPITAL";
  const priceDist = (l: RiskLeg | null, stopDist: number | null) => {
    if (!l?.enabled) return null;
    const p = l;
    switch (p.unit) {
      // Measured on capital: the % of capital (or ₹ amount) the trade should lose or make, over the position's shares.
      case "PERCENT":
        return onCapital ? ((p.value / 100) * capital) / quantity : (entry * p.value) / 100;
      case "POINTS":
        return onCapital ? p.value / quantity : p.value;
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
  if (o.reference === "CAPITAL") out.push("stop-loss and target measured on capital (% of capital or a ₹ amount), not the share price");
  if (o.breakEven) out.push(`stop to breakeven after ${o.breakEven.unit === "PERCENT" ? `${o.breakEven.value}%` : o.breakEven.unit === "POINTS" ? `${o.breakEven.value} pts` : o.breakEven.unit === "R_MULTIPLE" ? `${o.breakEven.value}R` : `${o.breakEven.value}× ATR`} in favour`);
  if (o.maxDailyLossPercent != null) out.push(`no new positions after a ${o.maxDailyLossPercent}% daily loss`);
  if (o.maxDrawdownPercent != null) out.push(`halts after a ${o.maxDrawdownPercent}% drawdown`);
  return out;
}
