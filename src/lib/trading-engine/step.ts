import type { Candle } from "@/lib/market-data";
import { istDayAndMinute } from "@/lib/market-data/resample";
import type { ConditionNode } from "@/lib/strategy/types";

// Whether the entry condition opens a long (buy first, sell to close) or
// short (sell first, buy to cover) position. Fixed per strategy — see
// Strategy.direction in the schema — not something that varies bar to bar.
export type StrategyDirection = "LONG" | "SHORT";

export interface EnginePosition {
  entryIdx: number;
  entryPrice: number;
  quantity: number;
  // Running highest high (long) / lowest low (short) since entry — the
  // basis for a trailing stop, which can only be computed bar-by-bar and
  // never precomputed like an entry/exit condition series.
  favorableExtreme: number;
  stopLossPrice: number | null;
  targetPrice: number | null;
  // How many entries have stacked into this position so far (1 = a plain,
  // non-pyramided position). Risk levels are always recomputed off the
  // blended average entryPrice after each add, not tracked per-leg.
  pyramidCount: number;
  /** Staged targets (TP1–TP3) only. Shares at entry, the sizes of the partial exits are a share of this. */
  initialQuantity?: number;
  /** How many staged targets have already been taken (0–3); a taken target never fires again. */
  targetsHit?: number;
  /** After a target is taken the rest of the position is protected by a stop here (null = none yet). */
  lockedStopPrice?: number | null;
  /** Entry plan only: the whole size the plan aims to build, and the first fill's price the further levels are measured from. */
  plannedQuantity?: number;
  anchorPrice?: number;
  /** Entry plan: the next further entry that can still fill. Entries that waited too long are skipped over, never blocking the ones after them. */
  levelCursor?: number;
  /** Set by a target whose stop rule is TRAIL: from then on the stop trails the best price by this distance. */
  trailAfter?: { unit: RiskUnit; value: number } | null;
}

export interface EngineState {
  cash: number;
  position: EnginePosition | null;
  /** A resting limit entry order waiting to fill (a broker DAY order). */
  pendingEntry?: PendingEntry | null;
  /** What the daily-loss and drawdown limits need to remember between candles (see `EngineLimits`). */
  memo?: EngineMemo;
}

/** Remembered across candles for the system limits: the day's starting cash and the highest cash so far. */
export interface EngineMemo {
  day?: number;
  dayStartCash?: number;
  peakCash?: number;
  /** Set once the drawdown limit is reached: no new positions after that. */
  halted?: boolean;
}

/** System-level limits on opening new positions. Exits are never blocked. */
export interface EngineLimits {
  /** No new positions for the rest of the day once the day's realised loss reaches this % of the day's starting capital. */
  maxDailyLossPercent?: number | null;
  /** No new positions at all once capital falls this % below its highest point. */
  maxDrawdownPercent?: number | null;
}

export interface PendingEntry {
  limitPrice: number;
  /** IST day number after which the order is cancelled (DAY validity). */
  expiresDay: number;
  /** Candles starting before this time were already checked against the order. */
  fromTime: number;
}

/** How entries are placed: at market (next candle's open) or as a limit order. */
export type EntryOrder =
  | { type: "MARKET" }
  | { type: "LIMIT"; mode: "PERCENT" | "PRICE"; value: number };

/** The limit price for an entry signalled at `signalClose`: a % better than it, or a fixed price. */
export function limitPriceFor(order: Extract<EntryOrder, { type: "LIMIT" }>, signalClose: number, direction: StrategyDirection): number {
  if (order.mode === "PRICE") return order.value;
  // A buy limit sits below the price, a sell (short) limit above it.
  return signalClose * (1 + (direction === "SHORT" ? 1 : -1) * (order.value / 100));
}

/** Did this candle trade at the limit or better? If so, at what price (the open, if it gapped through). */
function limitFill(bar: Candle, limit: number, direction: StrategyDirection): number | null {
  if (direction === "SHORT") return bar.high >= limit ? Math.max(bar.open, limit) : null;
  return bar.low <= limit ? Math.min(bar.open, limit) : null;
}

export type PositionSizingMode = "FULL_CAPITAL" | "FIXED_QUANTITY" | "FIXED_CAPITAL" | "PERCENT_OF_CAPITAL" | "RISK_PERCENT";

export interface PositionSizing {
  mode: PositionSizingMode;
  value: number | null;
  /** RISK_PERCENT only: the capital the risk percentage is taken of. Omitted = the cash the engine holds now (so it compounds). */
  riskCapital?: number;
}

/** R_MULTIPLE: a multiple of the stop-loss distance (2 = twice what the stop risks) — for targets only, and needs a stop-loss. */
export type RiskUnit = "PERCENT" | "POINTS" | "ATR_MULTIPLE" | "R_MULTIPLE";

export interface RiskLeg {
  enabled: boolean;
  unit: RiskUnit;
  value: number;
}

/**
 * What happens to the stop on the rest of the position once a target is taken:
 *  FIXED     — moved to that target's own price: the remainder is stopped out if price falls back to it.
 *  MARGIN    — moved to a set distance short of that target (a custom stop), so price can pull back a little first.
 *  BREAKEVEN — moved to the entry price: the rest can no longer lose.
 *  PREVIOUS  — moved to the previous target's price (for Target 1: the entry price).
 *  KEEP      — left where it was (the original stop-loss, or whatever an earlier target set).
 *  TRAIL     — from the next candle it trails the best price since entry by this distance (points, % or ATR).
 * A moved stop only ever tightens; it never loosens an earlier one.
 */
export type TargetLock =
  | { mode: "FIXED" }
  | { mode: "MARGIN"; unit: RiskUnit; value: number }
  | { mode: "BREAKEVEN" }
  | { mode: "PREVIOUS" }
  | { mode: "KEEP" }
  | { mode: "TRAIL"; unit: RiskUnit; value: number };
export const TARGET_LOCK_MODES = ["FIXED", "MARGIN", "BREAKEVEN", "PREVIOUS", "KEEP", "TRAIL"] as const;

/** One staged target (TP1, TP2 or TP3): where it is, how much of the position it sells, and how the profit is then locked. */
export interface TargetLevel {
  unit: RiskUnit;
  value: number;
  /** Share of the original position sold at this target (1–100). */
  exitPercent: number;
  lock: TargetLock;
}

export const MAX_TARGETS = 3;

/**
 * A further entry of a multi-level plan, measured from the first fill's price:
 *  PULLBACK — a resting buy that fills when price falls this far (for a short: rises this far): averaging in on weakness.
 *  BREAKOUT — a resting buy that fills when price rises this far (for a short: falls): adding on strength.
 *  SIGNAL   — a rule instead of a price (e.g. "RSI back above 40"): buys at the next candle's open once it is true.
 * Entries are taken in order; one that waits longer than its limit is dropped and the next one takes over.
 */
export interface EntryLevel {
  /** SIGNAL: not a price but a rule: the entry buys at the next open once the condition is true at a candle's close. */
  trigger: "PULLBACK" | "BREAKOUT" | "SIGNAL";
  unit: RiskUnit;
  value: number;
  /** SIGNAL levels only: the rule that triggers this entry (any rule the entry condition can express). */
  condition?: ConditionNode;
  /** Share of the planned size bought at this level (1–100). */
  allocationPercent: number;
  /** The level is withdrawn this many trading days after the first entry (omitted = it waits as long as the position is open). */
  maxWaitDays?: number;
}

/** A multi-level entry plan: the signal's own entry takes `firstPercent`, each level adds its share. */
export interface EntryPlan {
  firstPercent: number;
  levels: EntryLevel[];
  /** A swing time stop: the position is closed at the open this many trading days after the first entry. */
  maxHoldDays?: number;
}

export const MAX_ENTRY_LEVELS = 8;

export interface RiskManagementConfig {
  stopLoss: RiskLeg | null;
  target: RiskLeg | null;
  trailingSl: RiskLeg | null;
  /** Staged targets, in order. When present they replace the single `target`. */
  targets?: TargetLevel[];
  /** Break-even: once price has moved this far in the position's favour, the stop moves to the entry price. */
  breakEven?: RiskLeg | null;
}

/** The shape a risk leg takes as raw form/action input, before being
 * resolved into a `RiskLeg` (disabled legs still carry a unit/value so the
 * form can remember them if re-enabled). Shared by strategy creation and
 * (historically) the backtest/paper-session forms. */
export interface RiskLegInput {
  enabled: boolean;
  unit: RiskUnit;
  value: number;
}

export function toRiskLeg(leg: RiskLegInput): RiskLeg {
  return { enabled: leg.enabled, unit: leg.unit, value: leg.value };
}

export interface EngineConfig {
  brokeragePercent: number;
  slippagePercent: number;
  positionSizing: PositionSizing;
  // Defaults to "LONG" so every existing caller (built before shorting
  // existed) keeps behaving exactly as before without passing this.
  direction?: StrategyDirection;
  // Omitted or all-null legs = no risk management, exits are driven purely
  // by the strategy's own exit condition (pre-existing behavior).
  riskManagement?: RiskManagementConfig;
  // ATR value at the bar a position was entered on — required to resolve
  // an ATR_MULTIPLE leg. Only needed when a risk leg uses that unit.
  atrAtEntry?: (entryIdx: number) => number | undefined;
  // 1 (default) = today's behavior, a second entry signal while a position
  // is open is ignored. N > 1 allows up to N total entries to stack into
  // one blended position (pyramiding).
  maxPyramidEntries?: number;
  // Intraday session rules (IST minutes of the day), only set for strategies
  // on an intraday timeframe. Omitted = no time-of-day rules (daily strategies).
  session?: IntradaySession;
  /** Omitted = market orders (fill at the next candle's open). */
  entryOrder?: EntryOrder;
  /** Omitted = one entry per position, as before. */
  entryPlan?: EntryPlan;
  /** For each plan level (by index), whether its rule was true at the close of each candle; only SIGNAL levels need one. */
  levelSignals?: (boolean[] | undefined)[];
  /** Intraday leverage (buying power as a multiple of capital); 1 = none. The price is never changed, only how much can be bought. */
  leverage?: number;
  /** Daily-loss and drawdown limits on new positions. */
  limits?: EngineLimits;
  /** The most of the capital (× leverage) one position may use, in %; omitted = all of it. */
  maxCapitalUsePercent?: number | null;
}

/** The most shares a position may hold under the capital-use limit (Infinity when there's no limit). */
export function capitalUseCap(cash: number, fillPrice: number, leverage: number | undefined, maxCapitalUsePercent: number | null | undefined): number {
  if (maxCapitalUsePercent == null || !(maxCapitalUsePercent > 0) || maxCapitalUsePercent >= 100) return Infinity;
  const lev = leverage && leverage > 1 ? leverage : 1;
  return Math.floor((cash * lev * maxCapitalUsePercent) / 100 / fillPrice);
}

export interface IntradaySession {
  /** No new position (or pyramid add) whose fill would be at or after this minute. */
  noEntryAfterMinute?: number | null;
  /** Close any open position at the first candle at/after this minute — and always by the day's last candle. */
  squareOffMinute?: number | null;
  /**
   * The entry time window starts at the open (09:15): a signal on the previous
   * day's last candle may fill at today's first candle. Otherwise entries
   * never cross a day boundary.
   */
  allowOpeningEntry?: boolean;
  /**
   * Intraday product: square off by the day's last candle and never open a
   * position on a different day from its signal. Delivery on an intraday
   * timeframe leaves this off (positions may be held overnight).
   */
  flatOvernight?: boolean;
}

function sameIstDay(a: Candle, b: Candle | undefined): boolean {
  return !!b && istDayAndMinute(a.time).day === istDayAndMinute(b.time).day;
}

/** May an entry signalled on `bar` fill at `nextBar`'s open under the session rules? */
function entryAllowed(session: IntradaySession | undefined, bar: Candle, nextBar: Candle): boolean {
  if (!session) return true;
  // An intraday position never opens on a different day from its signal —
  // unless the strategy's entry time explicitly targets the open.
  if (session.flatOvernight && !sameIstDay(bar, nextBar) && !session.allowOpeningEntry) return false;
  return fillTimeAllowed(session, nextBar);
}

/** May an entry fill on this candle under the session's time rules? */
function fillTimeAllowed(session: IntradaySession | undefined, fillBar: Candle): boolean {
  if (!session) return true;
  const fillMinute = istDayAndMinute(fillBar.time).minute;
  if (session.noEntryAfterMinute != null && fillMinute >= session.noEntryAfterMinute) return false;
  if (session.squareOffMinute != null && fillMinute >= session.squareOffMinute) return false;
  return true;
}

/** The stop-loss distance a position entered at the price would carry: what risk-based sizing divides by. Undefined without a stop-loss. */
export function stopDistanceFor(config: { riskManagement?: RiskManagementConfig }, price: number, atr: number | undefined): number | undefined {
  const leg = config.riskManagement?.stopLoss;
  if (!leg?.enabled) return undefined;
  return resolveRiskDistance(leg, price, atr) ?? undefined;
}

/** Converts a risk leg into an absolute price distance from the entry price. An R multiple needs the stop-loss distance. */
export function resolveRiskDistance(leg: RiskLeg, entryPrice: number, atrAtEntry: number | undefined, stopDistance?: number | null): number | null {
  switch (leg.unit) {
    case "PERCENT":
      return entryPrice * (leg.value / 100);
    case "POINTS":
      return leg.value;
    case "ATR_MULTIPLE":
      return atrAtEntry !== undefined ? leg.value * atrAtEntry : null;
    case "R_MULTIPLE":
      return stopDistance != null && stopDistance > 0 ? leg.value * stopDistance : null;
  }
}

/** The stop-loss distance for a position entered at `entryPrice` (what an R multiple is a multiple of), or null without a stop. */
export function stopLossDistance(rm: RiskManagementConfig | undefined, entryPrice: number, atr: number | undefined): number | null {
  return rm?.stopLoss?.enabled ? resolveRiskDistance(rm.stopLoss, entryPrice, atr) : null;
}

/** Resolves stop-loss/target prices from an entry price — shared by a fresh
 * entry and by a pyramid add, since a pyramid add recomputes both off the
 * new blended entry price rather than tracking per-leg levels. A long's
 * stop sits below entry and target above; a short is the mirror image
 * (losses happen when price rises, so its stop sits above, target below). */
export function resolveRiskLevels(
  rm: RiskManagementConfig | undefined,
  entryPrice: number,
  atr: number | undefined,
  direction: StrategyDirection = "LONG",
): { stopLossPrice: number | null; targetPrice: number | null } {
  const stopLossDist = stopLossDistance(rm, entryPrice, atr);
  const targetDist = rm?.target?.enabled ? resolveRiskDistance(rm.target, entryPrice, atr, stopLossDist) : null;
  const sign = direction === "SHORT" ? -1 : 1;
  return {
    stopLossPrice: stopLossDist !== null ? entryPrice - sign * stopLossDist : null,
    targetPrice: targetDist !== null ? entryPrice + sign * targetDist : null,
  };
}

/** Why an entry plan can't be used, or null when it is fine. */
export function validateEntryPlan(plan: EntryPlan | undefined, maxPyramidEntries = 1): string | null {
  if (!plan) return null;
  if (plan.levels.length > MAX_ENTRY_LEVELS) return `At most ${MAX_ENTRY_LEVELS} further entry levels are supported.`;
  if (plan.levels.length > 0 && maxPyramidEntries > 1) return "Use either several entries per position (pyramiding) or an entry plan with levels, not both.";
  if (!Number.isFinite(plan.firstPercent) || plan.firstPercent <= 0 || plan.firstPercent > 100) return "The first entry must buy between 1% and 100% of the planned size.";
  if (plan.maxHoldDays !== undefined && (!Number.isInteger(plan.maxHoldDays) || plan.maxHoldDays < 1 || plan.maxHoldDays > 3650)) return "The maximum holding period must be a whole number of days, 1 or more.";
  let total = plan.firstPercent;
  const last = new Map<string, number>();
  for (const [i, l] of plan.levels.entries()) {
    const n = i + 2; // the signal's own entry is entry 1
    if (l.trigger === "SIGNAL") {
      if (!l.condition) return `Entry ${n} is triggered by a rule, so it needs one.`;
    } else if (!Number.isFinite(l.value) || l.value <= 0) return `Entry ${n} needs a distance above zero.`;
    if (!Number.isFinite(l.allocationPercent) || l.allocationPercent <= 0 || l.allocationPercent > 100) return `Entry ${n} must buy between 1% and 100% of the planned size.`;
    if (l.maxWaitDays !== undefined && (!Number.isInteger(l.maxWaitDays) || l.maxWaitDays < 1)) return `Entry ${n}'s waiting period must be a whole number of days, 1 or more.`;
    total += l.allocationPercent;
    if (l.trigger === "SIGNAL") continue;
    const key = `${l.trigger}:${l.unit}`;
    const prev = last.get(key);
    if (prev !== undefined && l.value <= prev) return `Entry ${n} must be further from the first entry than the one before it.`;
    last.set(key, l.value);
  }
  if (total > 100.0001) return `The entries buy ${total}% of the planned size in total; the most is 100%.`;
  return null;
}

/** Price at which a plan's further entry waits, measured from the first fill. */
export function entryLevelPrice(level: EntryLevel, anchor: number, atr: number | undefined, direction: StrategyDirection): number | null {
  const dist = resolveRiskDistance({ enabled: true, unit: level.unit, value: level.value }, anchor, atr);
  if (dist === null) return null;
  const down = (level.trigger === "PULLBACK") === (direction !== "SHORT"); // a long's pullback and a short's breakout sit below the anchor
  return anchor + (down ? -1 : 1) * dist;
}

/** Shares bought at the plan's first entry, and at a further level: their share of the planned size, at least one, never past the plan. */
export function entrySlice(percent: number, planned: number, bought: number): number {
  return Math.max(0, Math.min(planned - bought, Math.max(1, Math.floor((planned * percent) / 100))));
}

/** Why a set of staged targets can't be used, or null when it is fine. */
export function validateTargets(targets: TargetLevel[] | undefined, singleTargetOn = false): string | null {
  if (!targets || targets.length === 0) return null;
  if (targets.length > MAX_TARGETS) return `At most ${MAX_TARGETS} targets are supported.`;
  if (singleTargetOn) return "Use either the single take-profit or Targets 1–3, not both.";
  let total = 0;
  let prev: TargetLevel | null = null;
  for (const [i, t] of targets.entries()) {
    const n = i + 1;
    if (!Number.isFinite(t.value) || t.value <= 0) return `Target ${n} needs a distance above zero.`;
    if (!Number.isFinite(t.exitPercent) || t.exitPercent <= 0 || t.exitPercent > 100) return `Target ${n} must sell between 1% and 100% of the position.`;
    total += t.exitPercent;
    if ((t.lock.mode === "MARGIN" || t.lock.mode === "TRAIL") && (!Number.isFinite(t.lock.value) || t.lock.value <= 0)) return `Target ${n}'s ${t.lock.mode === "TRAIL" ? "trailing distance" : "margin"} needs a value above zero.`;
    if ((t.lock.mode === "MARGIN" || t.lock.mode === "TRAIL") && t.lock.unit === "R_MULTIPLE") return `Target ${n}'s ${t.lock.mode === "TRAIL" ? "trailing distance" : "margin"} must be in points, % or ATR.`;
    if (t.lock.mode === "MARGIN" && t.lock.unit === t.unit && t.lock.value >= t.value) return `Target ${n}'s margin must be smaller than the target distance itself.`;
    if (prev && prev.unit === t.unit && t.value <= prev.value) return `Target ${n} must be further from the entry than Target ${n - 1}.`;
    prev = t;
  }
  if (total > 100.0001) return `The targets sell ${total}% of the position in total; the most is 100%.`;
  return null;
}

/** Price of staged target `index` for a position entered at `entryPrice` (`stopDistance` for targets set as an R multiple). */
export function targetPrice(level: TargetLevel, entryPrice: number, atr: number | undefined, direction: StrategyDirection, stopDistance?: number | null): number | null {
  const dist = resolveRiskDistance({ enabled: true, unit: level.unit, value: level.value }, entryPrice, atr, stopDistance);
  if (dist === null) return null;
  return entryPrice + (direction === "SHORT" ? -1 : 1) * dist;
}

/**
 * Where the stop on the rest of the position moves once `level` is taken at `tp` (`previousTp`: the target before it).
 * Null = it doesn't move (KEEP, and TRAIL, which trails from the next candle). A moved stop is never worse than the
 * entry price, so a taken target can only ever turn a position into a risk-free one, not into a loser.
 */
export function lockFloor(level: TargetLevel, tp: number, entryPrice: number, atr: number | undefined, direction: StrategyDirection, previousTp?: number | null): number | null {
  const sign = direction === "SHORT" ? -1 : 1;
  let floor: number;
  switch (level.lock.mode) {
    case "KEEP":
    case "TRAIL":
      return null;
    case "BREAKEVEN":
      return entryPrice;
    case "PREVIOUS":
      floor = previousTp ?? entryPrice;
      break;
    case "MARGIN":
      floor = tp - sign * (resolveRiskDistance({ enabled: true, unit: level.lock.unit, value: level.lock.value }, entryPrice, atr) ?? 0);
      break;
    default:
      floor = tp;
  }
  return sign === 1 ? Math.max(floor, entryPrice) : Math.min(floor, entryPrice);
}

/** The tighter of two stops (higher for a long, lower for a short); either may be absent. */
export function tighterStop(a: number | null | undefined, b: number | null | undefined, direction: StrategyDirection): number | null {
  if (a == null) return b ?? null;
  if (b == null) return a;
  return direction === "SHORT" ? Math.min(a, b) : Math.max(a, b);
}

/** Shares a target sells: its share of the original position, at least one, never more than what is left. */
export function targetQuantity(level: TargetLevel, initialQuantity: number, remaining: number): number {
  return Math.min(remaining, Math.max(1, Math.floor((initialQuantity * level.exitPercent) / 100)));
}

/**
 * After a restart or a refused order: how many targets the broker's real position implies have been taken —
 * the consecutive targets whose combined shares were already sold.
 */
export function targetsTakenFor(targets: TargetLevel[], initialQuantity: number, remaining: number): number {
  const sold = initialQuantity - remaining;
  let cumulative = 0;
  let taken = 0;
  for (const t of targets) {
    cumulative += Math.max(1, Math.floor((initialQuantity * t.exitPercent) / 100));
    if (sold >= cumulative) taken++;
    else break;
  }
  return taken;
}

/**
 * Computes how many whole units to buy given available cash, the fill
 * price, and the configured sizing mode. Always rounds down to the
 * nearest whole tradable unit (universal convention — never round up)
 * and never exceeds what `cash` can actually afford, regardless of mode.
 */
export function computeQuantity(cash: number, fillPrice: number, sizing: PositionSizing, riskPerShare?: number, leverage = 1): number {
  // Intraday leverage raises what the capital can buy (each rupee of margin carries `leverage` rupees of position);
  // the share price itself never changes. Risk-based sizing still risks a share of the capital, not of the exposure.
  const lev = Number.isFinite(leverage) && leverage > 1 ? leverage : 1;
  const affordable = Math.floor((cash * lev) / fillPrice);

  switch (sizing.mode) {
    case "RISK_PERCENT": {
      // Risk a set share of capital: the shares whose stop-loss distance adds up to that rupee amount. No stop-loss, no size.
      if (!riskPerShare || !(riskPerShare > 0)) return 0;
      const base = sizing.riskCapital ?? cash;
      return Math.min(Math.floor((base * (sizing.value ?? 0)) / 100 / riskPerShare), affordable);
    }
    case "FIXED_QUANTITY":
      return Math.min(Math.floor(sizing.value ?? 0), affordable);
    case "FIXED_CAPITAL":
      return Math.floor((Math.min(sizing.value ?? 0, cash) * lev) / fillPrice);
    case "PERCENT_OF_CAPITAL":
      return Math.floor((cash * lev * (sizing.value ?? 0)) / 100 / fillPrice);
    case "FULL_CAPITAL":
    default:
      return affordable;
  }
}

export interface EngineTrade {
  entryTime: number;
  entryPrice: number;
  exitTime: number;
  exitPrice: number;
  quantity: number;
  grossPnl: number;
  fees: number;
  netPnl: number;
  netPnlPct: number;
  holdingBars: number;
}

function closeTrade(
  candles: Candle[],
  pos: EnginePosition,
  exitIdx: number,
  exitPrice: number,
  brokeragePercent: number,
  direction: StrategyDirection,
): EngineTrade {
  const entryValue = pos.entryPrice * pos.quantity;
  const exitValue = exitPrice * pos.quantity;
  const grossPnl = direction === "SHORT" ? entryValue - exitValue : exitValue - entryValue;
  const fees = (entryValue + exitValue) * (brokeragePercent / 100);
  const netPnl = grossPnl - fees;
  return {
    entryTime: candles[pos.entryIdx].time,
    entryPrice: pos.entryPrice,
    exitTime: candles[exitIdx].time,
    exitPrice,
    quantity: pos.quantity,
    grossPnl,
    fees,
    netPnl,
    netPnlPct: (netPnl / entryValue) * 100,
    holdingBars: exitIdx - pos.entryIdx,
  };
}

/**
 * Applies one bar's entry/exit signal to the engine state, honoring the
 * no-look-ahead rule: a signal true on bar `i` can only execute at bar
 * `i + 1`'s open. This is the single source of truth for how a simulated
 * fill happens — both backtesting and forward testing call this so the two
 * can never silently disagree on execution rules.
 *
 * Stop-loss/target/trailing-stop are the one deliberate exception: they
 * model a resting order sitting at a known price, so they can fill
 * intrabar — on bar `i` itself, using that bar's own (already-closed) high
 * and low — rather than waiting for bar `i + 1`'s open like a
 * condition-driven exit. This is still no-look-ahead: it only ever uses
 * data from a bar that has already completed. When both a stop and a
 * target could plausibly have been hit within the same bar (a gap-through),
 * the trailing stop is checked first, then the fixed stop-loss, then the
 * target — a conservative, deterministic tie-break. Within one bar, the
 * running favorable extreme is updated from that bar's high *before* the
 * stop check, i.e. it assumes the favorable move happened before any
 * reversal — a standard OHLC-only backtesting convention, since the true
 * intrabar order of price movement isn't knowable from candle data.
 */
/** Why a position closed — reported with each trade so fills can be explained. */
export type ExitReason = "trailing_stop" | "stop_loss" | "target" | "exit_rule" | "square_off" | "locked_profit" | "time_stop" | "opposite_signal" | "reversal";

export type StepResult = {
  state: EngineState;
  trade?: EngineTrade;
  exitReason?: ExitReason;
  sizeTooSmall?: boolean;
  /** Set on a staged-target sale: which target (1–3) this was. The position stays open unless it was the last share. */
  targetLevel?: number;
  /** Set when a further entry of a multi-level plan filled on this bar (level 2 = the first further entry). */
  entryLevel?: { level: number; quantity: number; price: number; /** When it fills: the candle that reached the price, or the open after a rule fired. */ time: number };
  /** An entry signal on this candle was ignored because a system limit had been reached. */
  blockedBy?: "daily_loss" | "drawdown";
};

/**
 * One bar of the engine. A multi-level entry plan is applied first, then the single-position rules run on the result:
 *  - a swing time stop closes the position at the open once it has been held long enough;
 *  - a resting further entry fills before the bar's stops are checked (the cautious order: price that reaches the
 *    entry is assumed to have gone on to the stop, never the other way round), and the stops and targets are
 *    recomputed from the blended average entry.
 */
/**
 * Trading days between two candles of a series: the number of times the IST day changes along the way. A gap of a
 * weekend or holiday between daily candles is still one trading day; a weekly (or longer) candle stands for the
 * sessions it covers (5 a week). Used for a plan's waiting periods and holding limit, so "30 days" means 30 sessions
 * whatever the candle size.
 */
export function tradingDaysBetween(candles: Candle[], fromIdx: number, toIdx: number): number {
  let days = 0;
  for (let k = fromIdx + 1; k <= toIdx && k < candles.length; k++) {
    const gap = istDayAndMinute(candles[k].time).day - istDayAndMinute(candles[k - 1].time).day;
    if (gap <= 0) continue;
    days += gap <= 4 ? 1 : Math.max(1, Math.round((gap * 5) / 7));
  }
  return days;
}

/**
 * One candle of the engine. The system limits wrap everything else: once the day's realised loss or the drawdown
 * from the peak reaches its limit, no new position is opened (open ones still exit by their own rules).
 */
export function stepBar(candles: Candle[], i: number, entrySignal: boolean, exitSignal: boolean, state: EngineState, config: EngineConfig): StepResult {
  const limits = config.limits;
  if (!limits || (limits.maxDailyLossPercent == null && limits.maxDrawdownPercent == null)) return planStep(candles, i, entrySignal, exitSignal, state, config);
  const day = istDayAndMinute(candles[i].time).day;
  const prev = state.memo ?? {};
  const memo: EngineMemo = prev.day === day ? { ...prev } : { ...prev, day, dayStartCash: state.cash };
  memo.peakCash = Math.max(memo.peakCash ?? state.cash, state.cash);
  const blocked = limitReached(memo, state.cash, limits);
  const r = planStep(candles, i, blocked && !state.position ? false : entrySignal, exitSignal, blocked && !state.position ? { ...state, pendingEntry: null } : state, config);
  // A pyramid add while blocked is undone by never letting the signal through above; record the cash after this candle.
  const after: EngineMemo = { ...memo, peakCash: Math.max(memo.peakCash ?? r.state.cash, r.state.cash) };
  if (limits.maxDrawdownPercent != null && after.peakCash! > 0 && ((after.peakCash! - r.state.cash) / after.peakCash!) * 100 >= limits.maxDrawdownPercent) after.halted = true;
  const reason = blocked && entrySignal && !state.position ? limitReason(memo, state.cash, limits) : null;
  return { ...r, state: { ...r.state, memo: after }, ...(reason ? { blockedBy: reason } : {}) };
}

/** Has a system limit stopped new positions? */
export function limitReached(memo: EngineMemo, cash: number, limits: EngineLimits): boolean {
  return limitReason(memo, cash, limits) !== null;
}

function limitReason(memo: EngineMemo, cash: number, limits: EngineLimits): "daily_loss" | "drawdown" | null {
  if (memo.halted) return "drawdown";
  if (limits.maxDrawdownPercent != null && memo.peakCash && ((memo.peakCash - cash) / memo.peakCash) * 100 >= limits.maxDrawdownPercent) return "drawdown";
  if (limits.maxDailyLossPercent != null && memo.dayStartCash && ((memo.dayStartCash - cash) / memo.dayStartCash) * 100 >= limits.maxDailyLossPercent) return "daily_loss";
  return null;
}

function planStep(candles: Candle[], i: number, entrySignal: boolean, exitSignal: boolean, state: EngineState, config: EngineConfig): StepResult {
  const plan = config.entryPlan;
  const pos0 = state.position;
  if (!plan || !pos0) return stepBarCore(candles, i, entrySignal, exitSignal, state, config);

  const direction = config.direction ?? "LONG";
  const isShort = direction === "SHORT";
  const bar = candles[i];
  const slip = (side: "open" | "close") => 1 + ((side === "open") === !isShort ? 1 : -1) * (config.slippagePercent / 100);

  if (plan.maxHoldDays !== undefined && i > pos0.entryIdx && tradingDaysBetween(candles, pos0.entryIdx, i) >= plan.maxHoldDays) {
    const trade = closeTrade(candles, pos0, i, bar.open * slip("close"), config.brokeragePercent, direction);
    return { state: { cash: state.cash + trade.netPnl, position: null }, trade, exitReason: "time_stop" };
  }

  const planned = pos0.plannedQuantity;
  const anchor = pos0.anchorPrice;
  const accumulating = planned !== undefined && anchor !== undefined && (pos0.targetsHit ?? 0) === 0;
  let pos = pos0;
  let cursor = pos0.levelCursor ?? Math.max(0, pos0.pyramidCount - 1);
  let moved = false;
  let entryLevel: StepResult["entryLevel"];

  /** Adds `qty` shares at `fill` to the position: blended average, stops and targets recomputed from it. */
  const addShares = (p: EnginePosition, qty: number, fill: number): EnginePosition => {
    const total = p.quantity + qty;
    const blended = (p.entryPrice * p.quantity + fill * qty) / total;
    const { stopLossPrice, targetPrice: tp } = resolveRiskLevels(config.riskManagement, blended, config.atrAtEntry?.(p.entryIdx), direction);
    return { ...p, entryPrice: blended, quantity: total, stopLossPrice, targetPrice: tp, pyramidCount: p.pyramidCount + 1, ...(p.initialQuantity !== undefined ? { initialQuantity: p.initialQuantity + qty } : {}) };
  };

  if (accumulating) {
    const waited = tradingDaysBetween(candles, pos0.entryIdx, i);
    const expired = (l: EntryLevel) => l.maxWaitDays !== undefined && waited > l.maxWaitDays;
    while (cursor < plan.levels.length && expired(plan.levels[cursor])) {
      cursor++;
      moved = true;
    }
    const next = plan.levels[cursor];
    if (next && next.trigger !== "SIGNAL" && fillTimeAllowed(config.session, bar)) {
      const level = entryLevelPrice(next, anchor!, config.atrAtEntry?.(pos0.entryIdx), direction);
      const reaches = level === null ? false : (next.trigger === "PULLBACK") === !isShort ? bar.low <= level : bar.high >= level;
      if (level !== null && reaches) {
        // A resting limit (pullback) fills at its price or better; a resting stop (breakout) at its price or the open if it gapped, plus slippage.
        const fill = next.trigger === "PULLBACK" ? (isShort ? Math.max(bar.open, level) : Math.min(bar.open, level)) : (isShort ? Math.min(bar.open, level) : Math.max(bar.open, level)) * slip("open");
        const qty = entrySlice(next.allocationPercent, planned!, pos.quantity);
        if (qty > 0) {
          pos = addShares(pos, qty, fill);
          entryLevel = { level: cursor + 2, quantity: qty, price: fill, time: bar.time };
          cursor++;
          moved = true;
        }
      }
    }
  }
  if (moved) pos = { ...pos, levelCursor: cursor };
  const r = stepBarCore(candles, i, entrySignal, exitSignal, moved ? { ...state, position: pos } : state, config);
  if (entryLevel) return { ...r, entryLevel };

  // A rule-triggered entry: judged on this candle's close, bought at the next open. Only while the position is still open
  // and untouched by a sale on this candle, so the rule never mixes with an exit.
  const p2 = r.state.position;
  const nextBar = candles[i + 1];
  const lv = plan.levels[cursor];
  if (accumulating && p2 && !r.trade && (p2.targetsHit ?? 0) === 0 && nextBar && lv?.trigger === "SIGNAL" && config.levelSignals?.[cursor]?.[i] && entryAllowed(config.session, bar, nextBar)) {
    const qty = entrySlice(lv.allocationPercent, planned!, p2.quantity);
    if (qty > 0) {
      const fill = nextBar.open * slip("open");
      const grown = { ...addShares(p2, qty, fill), levelCursor: cursor + 1 };
      return { ...r, state: { ...r.state, position: grown }, entryLevel: { level: cursor + 2, quantity: qty, price: fill, time: nextBar.time } };
    }
  }
  return r;
}

function stepBarCore(
  candles: Candle[],
  i: number,
  entrySignal: boolean,
  exitSignal: boolean,
  state: EngineState,
  config: EngineConfig,
): StepResult {
  const nextBar = candles[i + 1];
  const direction = config.direction ?? "LONG";
  const isShort = direction === "SHORT";
  // A long buys to open (slippage costs you more) and sells to close
  // (slippage gets you less); a short is the mirror image on both sides.
  const openFillPrice = (open: number) => open * (1 + (isShort ? -1 : 1) * (config.slippagePercent / 100));
  const closeFillPrice = (open: number) => open * (1 + (isShort ? 1 : -1) * (config.slippagePercent / 100));

  if (state.position) {
    const bar = candles[i];
    const rm = config.riskManagement;
    let pos = state.position;
    {
      // Stops that move with the trade, judged on the best price of the candles before this one (never this candle's,
      // which would assume its high came before its low): break-even, and the trail a taken target switched on.
      const atr = config.atrAtEntry?.(pos.entryIdx);
      const sign = isShort ? -1 : 1;
      const moved = (pos.favorableExtreme - pos.entryPrice) * sign;
      let lock = pos.lockedStopPrice ?? null;
      if (rm?.breakEven?.enabled) {
        const trigger = resolveRiskDistance(rm.breakEven, pos.entryPrice, atr, stopLossDistance(rm, pos.entryPrice, atr));
        if (trigger !== null && trigger > 0 && moved >= trigger) lock = tighterStop(lock, pos.entryPrice, direction);
      }
      if (pos.trailAfter) {
        const dist = resolveRiskDistance({ enabled: true, ...pos.trailAfter }, pos.entryPrice, atr);
        if (dist !== null) lock = tighterStop(lock, pos.favorableExtreme - sign * dist, direction);
      }
      if (lock !== (pos.lockedStopPrice ?? null)) pos = { ...pos, lockedStopPrice: lock };
    }

    // Intraday square-off time reached: close at this candle's open, before anything else.
    const session = config.session;
    if (session?.squareOffMinute != null && i > pos.entryIdx && istDayAndMinute(bar.time).minute >= session.squareOffMinute) {
      const trade = closeTrade(candles, pos, i, closeFillPrice(bar.open), config.brokeragePercent, direction);
      return { state: { cash: state.cash + trade.netPnl, position: null }, trade, exitReason: "square_off" };
    }
    const favorableExtreme = isShort ? Math.min(pos.favorableExtreme, bar.low) : Math.max(pos.favorableExtreme, bar.high);

    let trailingStopPrice: number | null = null;
    if (rm?.trailingSl?.enabled) {
      const atr = config.atrAtEntry?.(pos.entryIdx);
      const dist = resolveRiskDistance(rm.trailingSl, pos.entryPrice, atr);
      if (dist !== null) trailingStopPrice = isShort ? favorableExtreme + dist : favorableExtreme - dist;
    }

    let exitPrice: number | null = null;
    let exitReason: ExitReason | null = null;
    // The stop in force is the tighter of the stop-loss and the one a taken target set. That one applies from the
    // bar after the target was taken (see `lockedStopPrice`), never on the same bar.
    const locked = pos.lockedStopPrice ?? null;
    const lockWins = locked !== null && (pos.stopLossPrice === null || (isShort ? locked <= pos.stopLossPrice : locked >= pos.stopLossPrice));
    const activeStop = lockWins ? locked : pos.stopLossPrice;
    if (trailingStopPrice !== null && (isShort ? bar.high >= trailingStopPrice : bar.low <= trailingStopPrice)) {
      exitPrice = trailingStopPrice;
      exitReason = "trailing_stop";
    } else if (activeStop !== null && (isShort ? bar.high >= activeStop : bar.low <= activeStop)) {
      exitPrice = activeStop;
      exitReason = lockWins ? "locked_profit" : "stop_loss";
    } else if (pos.targetPrice !== null && (isShort ? bar.low <= pos.targetPrice : bar.high >= pos.targetPrice)) {
      exitPrice = pos.targetPrice;
      exitReason = "target";
    }

    if (exitPrice !== null && exitReason) {
      const trade = closeTrade(candles, pos, i, exitPrice, config.brokeragePercent, direction);
      return { state: { cash: state.cash + trade.netPnl, position: null }, trade, exitReason };
    }

    // Staged targets: the next untaken target sells its share and locks profit on the rest. One target per bar,
    // so a gap through two targets takes the second on the following bar.
    const staged = rm?.targets ?? [];
    const taken = pos.targetsHit ?? 0;
    if (staged.length > taken) {
      const level = staged[taken];
      const atr = config.atrAtEntry?.(pos.entryIdx);
      const stopDist = stopLossDistance(rm, pos.entryPrice, atr);
      const tp = targetPrice(level, pos.entryPrice, atr, direction, stopDist);
      if (tp !== null && (isShort ? bar.low <= tp : bar.high >= tp)) {
        const initial = pos.initialQuantity ?? pos.quantity;
        const sellQty = targetQuantity(level, initial, pos.quantity);
        const last = taken + 1 >= staged.length;
        if (sellQty >= pos.quantity || (last && staged.reduce((n, t) => n + t.exitPercent, 0) >= 100)) {
          const trade = closeTrade(candles, pos, i, tp, config.brokeragePercent, direction);
          return { state: { cash: state.cash + trade.netPnl, position: null }, trade, exitReason: "target", targetLevel: taken + 1 };
        }
        const part = closeTrade(candles, { ...pos, quantity: sellQty }, i, tp, config.brokeragePercent, direction);
        const previousTp = taken > 0 ? targetPrice(staged[taken - 1], pos.entryPrice, atr, direction, stopDist) : null;
        const floor = lockFloor(level, tp, pos.entryPrice, atr, direction, previousTp);
        const nextLock = tighterStop(locked, floor, direction);
        const trailAfter = level.lock.mode === "TRAIL" ? { unit: level.lock.unit, value: level.lock.value } : (pos.trailAfter ?? null);
        return {
          state: {
            ...state,
            cash: state.cash + part.netPnl,
            position: { ...pos, quantity: pos.quantity - sellQty, favorableExtreme, initialQuantity: initial, targetsHit: taken + 1, lockedStopPrice: nextLock, trailAfter },
          },
          trade: part,
          exitReason: "target",
          targetLevel: taken + 1,
        };
      }
    }

    if (exitSignal && nextBar) {
      const fillPrice = closeFillPrice(nextBar.open);
      const trade = closeTrade(candles, pos, i + 1, fillPrice, config.brokeragePercent, direction);
      return { state: { cash: state.cash + trade.netPnl, position: null }, trade, exitReason: "exit_rule" };
    }

    // Intraday: never carry a position overnight. The data may end before the
    // square-off time (Yahoo's last NSE candle is 15:15), so the day's last
    // candle always closes it, at its close.
    if (session?.flatOvernight && nextBar && !sameIstDay(bar, nextBar)) {
      const trade = closeTrade(candles, pos, i, closeFillPrice(bar.close), config.brokeragePercent, direction);
      return { state: { cash: state.cash + trade.netPnl, position: null }, trade, exitReason: "square_off" };
    }

    const maxPyramidEntries = config.maxPyramidEntries ?? 1;
    if (entrySignal && nextBar && pos.pyramidCount < maxPyramidEntries && entryAllowed(session, bar, nextBar)) {
      // A limit add is only good for the next candle (it doesn't rest while a position is open).
      const order = config.entryOrder;
      const fillPrice = order?.type === "LIMIT" ? limitFill(nextBar, limitPriceFor(order, bar.close, direction), direction) : openFillPrice(nextBar.open);
      if (fillPrice === null) return { state: { ...state, position: { ...pos, favorableExtreme } } };
      // An add may only take the position up to the capital-use limit.
      const room = capitalUseCap(state.cash, fillPrice, config.leverage, config.maxCapitalUsePercent) - pos.quantity;
      const addQuantity = Math.min(room, computeQuantity(state.cash, fillPrice, config.positionSizing, stopDistanceFor(config, fillPrice, config.atrAtEntry?.(i + 1)), config.leverage));
      if (addQuantity > 0) {
        const totalQuantity = pos.quantity + addQuantity;
        const blendedEntryPrice = (pos.entryPrice * pos.quantity + fillPrice * addQuantity) / totalQuantity;
        const atr = config.atrAtEntry?.(i + 1);
        const { stopLossPrice, targetPrice } = resolveRiskLevels(config.riskManagement, blendedEntryPrice, atr, direction);
        return {
          state: {
            ...state,
            position: {
              entryIdx: pos.entryIdx,
              entryPrice: blendedEntryPrice,
              quantity: totalQuantity,
              favorableExtreme,
              stopLossPrice,
              targetPrice,
              pyramidCount: pos.pyramidCount + 1,
              ...(pos.initialQuantity !== undefined ? { initialQuantity: pos.initialQuantity + addQuantity } : {}),
              targetsHit: pos.targetsHit,
              lockedStopPrice: pos.lockedStopPrice,
              plannedQuantity: pos.plannedQuantity,
              anchorPrice: pos.anchorPrice,
              levelCursor: pos.levelCursor,
              trailAfter: pos.trailAfter,
            },
          },
        };
      }
    }

    return { state: { ...state, position: { ...pos, favorableExtreme } } };
  }

  /** Opens a position at `fillIdx` for `fillPrice`, or reports that the size came out as zero. */
  const open = (fillIdx: number, fillPrice: number) => {
    const wanted = Math.min(capitalUseCap(state.cash, fillPrice, config.leverage, config.maxCapitalUsePercent), computeQuantity(state.cash, fillPrice, config.positionSizing, stopDistanceFor(config, fillPrice, config.atrAtEntry?.(fillIdx)), config.leverage));
    if (wanted <= 0) return { state: { ...state, pendingEntry: null }, sizeTooSmall: true };
    // A multi-level plan buys only its first share now and keeps the rest of the planned size for its further levels.
    const plan = config.entryPlan;
    const quantity = plan ? entrySlice(plan.firstPercent, wanted, 0) : wanted;
    if (quantity <= 0) return { state: { ...state, pendingEntry: null }, sizeTooSmall: true };
    const atr = config.atrAtEntry?.(fillIdx);
    const { stopLossPrice, targetPrice } = resolveRiskLevels(config.riskManagement, fillPrice, atr, direction);
    return {
      state: {
        cash: state.cash,
        pendingEntry: null,
        position: { entryIdx: fillIdx, entryPrice: fillPrice, quantity, favorableExtreme: fillPrice, stopLossPrice, targetPrice, pyramidCount: 1, ...(config.riskManagement?.targets?.length ? { initialQuantity: quantity, targetsHit: 0, lockedStopPrice: null } : {}), ...(plan ? { plannedQuantity: wanted, anchorPrice: fillPrice } : {}) },
      },
    };
  };

  // A resting limit order: fills on this candle if it traded at the limit, or
  // expires at the end of its day. New signals are ignored while it rests.
  const pending = state.pendingEntry;
  if (pending && candles[i].time >= pending.fromTime) {
    const bar = candles[i];
    if (istDayAndMinute(bar.time).day > pending.expiresDay) {
      state = { ...state, pendingEntry: null };
    } else {
      const price = fillTimeAllowed(config.session, bar) ? limitFill(bar, pending.limitPrice, direction) : null;
      if (price !== null) return open(i, price);
      return { state };
    }
  } else if (pending) {
    return { state };
  }

  if (entrySignal && nextBar && entryAllowed(config.session, candles[i], nextBar)) {
    const order = config.entryOrder;
    if (order?.type === "LIMIT") {
      const limit = limitPriceFor(order, candles[i].close, direction);
      const price = limitFill(nextBar, limit, direction);
      if (price !== null) return open(i + 1, price);
      // Not reached on the next candle: rest as a DAY order until it fills or the day ends.
      return {
        state: {
          ...state,
          pendingEntry: { limitPrice: limit, expiresDay: istDayAndMinute(nextBar.time).day, fromTime: candles[i + 2]?.time ?? nextBar.time + 1 },
        },
      };
    }
    return open(i + 1, openFillPrice(nextBar.open));
  }

  return { state };
}

/** Closes an open position at a given bar's close — used to finalize a
 * backtest at the end of its data range. Forward testing never calls this;
 * an open forward-test position just stays open until a real exit signal fires. */
export function forceClose(
  candles: Candle[],
  idx: number,
  state: EngineState,
  config: EngineConfig,
): { state: EngineState; trade?: EngineTrade } {
  if (!state.position) return { state };
  const trade = closeTrade(candles, state.position, idx, candles[idx].close, config.brokeragePercent, config.direction ?? "LONG");
  return { state: { cash: state.cash + trade.netPnl, position: null }, trade };
}

export function validatePositionSizing(sizing: PositionSizing): void {
  if (sizing.mode === "FULL_CAPITAL") return;
  if (sizing.value === null || !Number.isFinite(sizing.value) || sizing.value <= 0) {
    throw new Error("Position sizing value must be a positive number for this mode");
  }
  if (sizing.mode === "FIXED_QUANTITY" && !Number.isInteger(sizing.value)) {
    throw new Error("Fixed quantity sizing must be a whole number of shares");
  }
  if (sizing.mode === "PERCENT_OF_CAPITAL" && sizing.value > 100) {
    throw new Error("Percent of capital sizing cannot exceed 100%");
  }
  if (sizing.mode === "RISK_PERCENT" && sizing.value > 100) {
    throw new Error("Risk per position cannot exceed 100% of capital");
  }
}

export function markToMarket(candles: Candle[], idx: number, state: EngineState, direction: StrategyDirection = "LONG"): number {
  if (!state.position) return state.cash;
  const diff = candles[idx].close - state.position.entryPrice;
  const unrealized = (direction === "SHORT" ? -diff : diff) * state.position.quantity;
  return state.cash + unrealized;
}
