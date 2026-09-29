import type { Candle } from "@/lib/market-data";

// Multi-leg options backtesting on real option prices, one trading day at a
// time: pick the expiry and at-the-money strike at the entry minute, price
// every leg from its own 1-minute candles, then walk the minutes until the
// square-off time, a combined stop-loss or a combined target. Pure — the data
// comes from backtest-data.ts.

export type OptionType = "CE" | "PE";
export type Side = "BUY" | "SELL";
export type StrategyLeg = { type: OptionType; side: Side; offset: number; lots: number };
export type ExpiryRule = "WEEKLY_CURRENT" | "WEEKLY_NEXT" | "MONTHLY";
export type RiskUnit = "RUPEES" | "PREMIUM_PCT";

export type OptionStrategyConfig = {
  underlying: string;
  legs: StrategyLeg[];
  expiryRule: ExpiryRule;
  entryMinute: number;
  exitMinute: number;
  weekdays: number[];
  stopLossUnit: RiskUnit | null;
  stopLossValue: number | null;
  targetUnit: RiskUnit | null;
  targetValue: number | null;
};

export type Costs = { brokeragePerOrder: number; slippagePct: number };

export type TradeLeg = { symbol: string; type: OptionType; side: Side; strike: number; qty: number; entry: number; exit: number };
export type ExitReason = "TIME" | "STOP_LOSS" | "TARGET";
export type DayTrade = {
  date: string;
  expiry: string;
  spot: number;
  atm: number;
  legs: TradeLeg[];
  entryMinute: number;
  exitMinute: number;
  exitReason: ExitReason;
  /** Premium received (+) or paid (−) at entry, in ₹, after slippage. */
  premium: number;
  grossPnl: number;
  costs: number;
  netPnl: number;
  /** Best and worst open P&L during the day (₹). */
  peak: number;
  trough: number;
};

const IST = 5.5 * 3600;
export const istMinuteOf = (t: number) => Math.floor(((t + IST) % 86400) / 60);
export const istDateOf = (t: number) => new Date((t + IST) * 1000).toISOString().slice(0, 10);
/** 1 = Monday … 7 = Sunday for a yyyy-mm-dd date. */
export const weekdayOf = (date: string) => ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;

// ---------- contracts: expiries and strikes ----------

export type Contracts = Map<string, number[]>; // expiry (yyyy-mm-dd) → listed strikes, ascending

/** Expiries and strikes of an underlying's options from exchange symbols like "NIFTY26100622700CE". */
export function parseContracts(symbols: string[], underlying: string): Contracts {
  const re = new RegExp(`^${underlying.replace(/[^A-Z0-9&-]/g, "")}(\\d{2})(\\d{2})(\\d{2})(\\d+(?:\\.\\d+)?)(CE|PE)$`);
  const map = new Map<string, Set<number>>();
  for (const s of symbols) {
    const m = re.exec(s.trim());
    if (!m) continue;
    const expiry = `20${m[1]}-${m[2]}-${m[3]}`;
    if (!map.has(expiry)) map.set(expiry, new Set());
    map.get(expiry)!.add(Number(m[4]));
  }
  return new Map([...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([e, s]) => [e, [...s].sort((x, y) => x - y)]));
}

/** The expiry a trade on `date` uses. */
export function chooseExpiry(date: string, expiries: string[], rule: ExpiryRule): string | null {
  const upcoming = expiries.filter((e) => e >= date).sort();
  if (rule === "WEEKLY_CURRENT") return upcoming[0] ?? null;
  if (rule === "WEEKLY_NEXT") return upcoming[1] ?? null;
  const first = upcoming[0];
  if (!first) return null;
  const month = first.slice(0, 7);
  return upcoming.filter((e) => e.startsWith(month)).at(-1) ?? null;
}

/** The listed strike nearest the spot, and the strike `offset` listings away from it. */
export function strikeAt(strikes: number[], spot: number, offset: number): { atm: number; strike: number } | null {
  if (!strikes.length) return null;
  let i = 0;
  for (let k = 1; k < strikes.length; k++) if (Math.abs(strikes[k] - spot) < Math.abs(strikes[i] - spot)) i = k;
  const j = i + offset;
  return j >= 0 && j < strikes.length ? { atm: strikes[i], strike: strikes[j] } : null;
}

export const optionSymbol = (underlying: string, expiry: string, strike: number, type: OptionType) =>
  `${underlying}${expiry.slice(2, 4)}${expiry.slice(5, 7)}${expiry.slice(8, 10)}${strike}${type}`;

// ---------- one day ----------

/** Price of a leg at a minute: that minute's candle, else the last one before it (forward-filled). */
function priceAt(bars: Candle[], minute: number, field: "open" | "close"): number | null {
  let last: Candle | null = null;
  for (const b of bars) {
    const m = istMinuteOf(b.time);
    if (m > minute) break;
    last = b;
    if (m === minute) return b[field];
  }
  return last ? last.close : null;
}

export type DayLegInput = { leg: StrategyLeg; symbol: string; strike: number; bars: Candle[] };

/**
 * Simulates one day. Entry at the entry minute's open (slippage against you),
 * then each minute's close is checked against the combined stop-loss/target;
 * otherwise squared off at the exit minute. Null when a leg has no price at entry.
 */
export function simulateDay(
  input: { date: string; expiry: string; spot: number; atm: number; legs: DayLegInput[] },
  cfg: Pick<OptionStrategyConfig, "entryMinute" | "exitMinute" | "stopLossUnit" | "stopLossValue" | "targetUnit" | "targetValue">,
  costs: Costs,
  lotSize: number,
): DayTrade | null {
  const slip = costs.slippagePct / 100;
  const legs = input.legs.map((l) => {
    const raw = priceAt(l.bars, cfg.entryMinute, "open");
    const qty = l.leg.lots * lotSize;
    const entry = raw == null ? null : l.leg.side === "BUY" ? raw * (1 + slip) : raw * (1 - slip);
    return { ...l, qty, entry };
  });
  if (legs.some((l) => l.entry == null || !(l.entry > 0))) return null;

  const dir = (s: Side) => (s === "BUY" ? 1 : -1);
  const premium = legs.reduce((s, l) => s - dir(l.leg.side) * l.entry! * l.qty, 0);
  const premiumAbs = legs.reduce((s, l) => s + l.entry! * l.qty, 0);
  const limit = (unit: RiskUnit | null, value: number | null) => (unit && value && value > 0 ? (unit === "RUPEES" ? value : (value / 100) * premiumAbs) : null);
  const sl = limit(cfg.stopLossUnit, cfg.stopLossValue);
  const tgt = limit(cfg.targetUnit, cfg.targetValue);
  const pnlAt = (minute: number) => legs.reduce((s, l) => s + dir(l.leg.side) * ((priceAt(l.bars, minute, "close") ?? l.entry!) - l.entry!) * l.qty, 0);

  let exitMinute = cfg.exitMinute;
  let exitReason: ExitReason = "TIME";
  let peak = 0;
  let trough = 0;
  for (let m = cfg.entryMinute; m < cfg.exitMinute; m++) {
    const pnl = pnlAt(m);
    peak = Math.max(peak, pnl);
    trough = Math.min(trough, pnl);
    if (sl != null && pnl <= -sl) {
      exitMinute = m;
      exitReason = "STOP_LOSS";
      break;
    }
    if (tgt != null && pnl >= tgt) {
      exitMinute = m;
      exitReason = "TARGET";
      break;
    }
  }

  const tradeLegs: TradeLeg[] = legs.map((l) => {
    const raw = (exitReason === "TIME" ? priceAt(l.bars, exitMinute, "open") : priceAt(l.bars, exitMinute, "close")) ?? l.entry!;
    const exit = l.leg.side === "BUY" ? raw * (1 - slip) : raw * (1 + slip);
    return { symbol: l.symbol, type: l.leg.type, side: l.leg.side, strike: l.strike, qty: l.qty, entry: round(l.entry!), exit: round(exit) };
  });
  const grossPnl = tradeLegs.reduce((s, l) => s + dir(l.side) * (l.exit - l.entry) * l.qty, 0);
  const charges = costs.brokeragePerOrder * tradeLegs.length * 2;
  return {
    date: input.date,
    expiry: input.expiry,
    spot: round(input.spot),
    atm: input.atm,
    legs: tradeLegs,
    entryMinute: cfg.entryMinute,
    exitMinute,
    exitReason,
    premium: round(premium),
    grossPnl: round(grossPnl),
    costs: round(charges),
    netPnl: round(grossPnl - charges),
    peak: round(peak),
    trough: round(trough),
  };
}

const round = (n: number) => Math.round(n * 100) / 100;

// ---------- results ----------

export type OptionBacktestStats = {
  days: number;
  wins: number;
  losses: number;
  winRatePct: number;
  netPnl: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number | null;
  expectancy: number;
  maxDrawdown: number;
  bestDay: number;
  worstDay: number;
  stopLossHits: number;
  targetHits: number;
  byWeekday: { weekday: number; days: number; netPnl: number }[];
  equity: { date: string; value: number }[];
};

export function summarizeOptionBacktest(trades: DayTrade[]): OptionBacktestStats {
  const sorted = [...trades].sort((a, b) => a.date.localeCompare(b.date));
  const wins = sorted.filter((t) => t.netPnl > 0);
  const losses = sorted.filter((t) => t.netPnl <= 0);
  const sum = (xs: DayTrade[]) => xs.reduce((s, t) => s + t.netPnl, 0);
  let cum = 0;
  let high = 0;
  let maxDd = 0;
  const equity = sorted.map((t) => {
    cum += t.netPnl;
    high = Math.max(high, cum);
    maxDd = Math.max(maxDd, high - cum);
    return { date: t.date, value: round(cum) };
  });
  const byWeekday = [1, 2, 3, 4, 5].map((w) => {
    const d = sorted.filter((t) => weekdayOf(t.date) === w);
    return { weekday: w, days: d.length, netPnl: round(sum(d)) };
  });
  const grossWin = sum(wins);
  const grossLoss = -sum(losses);
  return {
    days: sorted.length,
    wins: wins.length,
    losses: losses.length,
    winRatePct: sorted.length ? round((wins.length / sorted.length) * 100) : 0,
    netPnl: round(sum(sorted)),
    avgWin: wins.length ? round(grossWin / wins.length) : 0,
    avgLoss: losses.length ? round(-grossLoss / losses.length) : 0,
    profitFactor: grossLoss > 0 ? round(grossWin / grossLoss) : null,
    expectancy: sorted.length ? round(sum(sorted) / sorted.length) : 0,
    maxDrawdown: round(maxDd),
    bestDay: sorted.length ? Math.max(...sorted.map((t) => t.netPnl)) : 0,
    worstDay: sorted.length ? Math.min(...sorted.map((t) => t.netPnl)) : 0,
    stopLossHits: sorted.filter((t) => t.exitReason === "STOP_LOSS").length,
    targetHits: sorted.filter((t) => t.exitReason === "TARGET").length,
    byWeekday,
    equity,
  };
}
