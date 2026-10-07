import type { Candle } from "@/lib/market-data";
import { istDayAndMinute } from "@/lib/market-data/resample";
import { evaluateConditionsPerBar } from "@/lib/strategy";
import { levelSignalSeries } from "@/lib/strategy/plan-conditions";
import { computeIndicatorSeries } from "@/lib/strategy/compute-series";
import type { ConditionNode, AuxCandleMap } from "@/lib/strategy";
import {
  stepBar,
  forceClose,
  markToMarket,
  type EngineState,
  type EngineTrade,
  type ExitReason,
  type PositionSizing,
  type RiskManagementConfig,
  type StrategyDirection,
  type IntradaySession,
  type EntryOrder,
  type EntryPlan,
  type StepResult,
} from "@/lib/trading-engine/step";

import { engineRisk, type RiskOptions } from "@/lib/trading-engine/risk-options";
import { startSystem, stepSystemBar } from "@/lib/trading-engine/system-step";
import { systemRules, systemSignalSeries } from "@/lib/system/signals";
import type { SystemRuntime } from "@/lib/system/types";

const DEFAULT_ATR_PERIOD = 14;

export interface BacktestConfig {
  startingCapital: number;
  brokeragePercent: number;
  slippagePercent: number;
  positionSizing: PositionSizing;
  riskManagement?: RiskManagementConfig;
  maxPyramidEntries?: number;
  direction?: StrategyDirection;
  session?: IntradaySession;
  entryOrder?: EntryOrder;
  /** Multi-level entry plan (swing): omitted = one entry per position. */
  entryPlan?: EntryPlan;
  /** TP/SL reference, leverage, break-even and system limits: omitted = the defaults. */
  riskOptions?: RiskOptions;
  /** A trading system: its concepts choose each position's side (the entry/exit rules passed in are not used). */
  system?: SystemRuntime;
}

function usesAtr(rm: RiskManagementConfig | undefined, plan?: EntryPlan): boolean {
  if (plan?.levels.some((l) => l.unit === "ATR_MULTIPLE")) return true;
  if (!rm) return false;
  if ([rm.stopLoss, rm.target, rm.trailingSl, rm.breakEven].some((leg) => leg?.enabled && leg.unit === "ATR_MULTIPLE")) return true;
  return (rm.targets ?? []).some((t) => t.unit === "ATR_MULTIPLE" || ((t.lock.mode === "MARGIN" || t.lock.mode === "TRAIL") && t.lock.unit === "ATR_MULTIPLE"));
}

/** The parts of a position that was built or sold in stages: each sale, and each further entry. */
export type TradeLegs = {
  exits: { time: number; price: number; quantity: number; netPnl: number; reason: ExitReason | "end_of_data"; targetLevel?: number }[];
  entries: { level: number; time: number; price: number; quantity: number }[];
};

/** A closed trade, plus why it closed ("end_of_data" = still open when the data ran out). A position sold or built in parts is ONE trade; `legs` has its parts. */
export type BacktestTradeResult = EngineTrade & { exitReason?: ExitReason | "end_of_data"; legs?: TradeLegs; /** Trading systems: this trade's side. */ direction?: StrategyDirection };

/** The sales of one position, merged into the single trade it was: total shares, average entry and exit, summed P&L. */
export function mergePositionTrades(parts: BacktestTradeResult[], targetLevels: (number | undefined)[], entries: TradeLegs["entries"]): BacktestTradeResult {
  const staged = parts.length > 1 || entries.length > 0 || targetLevels.some((t) => t !== undefined);
  if (!staged) return parts[0];
  const quantity = parts.reduce((n, p) => n + p.quantity, 0);
  const weighted = (pick: (p: BacktestTradeResult) => number) => parts.reduce((n, p) => n + pick(p) * p.quantity, 0) / quantity;
  const grossPnl = parts.reduce((n, p) => n + p.grossPnl, 0);
  const fees = parts.reduce((n, p) => n + p.fees, 0);
  const netPnl = grossPnl - fees;
  const entryPrice = weighted((p) => p.entryPrice);
  const last = parts[parts.length - 1];
  return {
    entryTime: parts[0].entryTime,
    entryPrice,
    exitTime: last.exitTime,
    exitPrice: weighted((p) => p.exitPrice),
    quantity,
    grossPnl,
    fees,
    netPnl,
    netPnlPct: (netPnl / (entryPrice * quantity)) * 100,
    holdingBars: Math.max(...parts.map((p) => p.holdingBars)),
    exitReason: last.exitReason,
    legs: {
      exits: parts.map((p, i) => ({ time: p.exitTime, price: p.exitPrice, quantity: p.quantity, netPnl: p.netPnl, reason: p.exitReason ?? "exit_rule", ...(targetLevels[i] !== undefined ? { targetLevel: targetLevels[i] } : {}) })),
      entries,
    },
  };
}

export interface EquityPoint {
  time: number;
  equity: number;
}

export interface BacktestMetrics {
  totalReturnPct: number;
  cagrPct: number;
  winRatePct: number;
  profitFactor: number;
  maxDrawdownPct: number;
  sharpeRatio: number;
  expectancy: number;
  tradeCount: number;
  avgHoldingBars: number;
}

export interface BacktestResult {
  trades: BacktestTradeResult[];
  equityCurve: EquityPoint[];
  metrics: BacktestMetrics;
}

function computeMetrics(
  trades: BacktestTradeResult[],
  equityCurve: EquityPoint[],
  startingCapital: number,
): BacktestMetrics {
  const tradeCount = trades.length;
  const finalEquity = equityCurve.at(-1)?.equity ?? startingCapital;
  const totalReturnPct = ((finalEquity - startingCapital) / startingCapital) * 100;

  const firstTime = equityCurve[0]?.time ?? 0;
  const lastTime = equityCurve.at(-1)?.time ?? firstTime;
  const daysElapsed = Math.max((lastTime - firstTime) / 86400, 1);
  const cagrPct = (Math.pow(finalEquity / startingCapital, 365 / daysElapsed) - 1) * 100;

  const wins = trades.filter((t) => t.netPnl > 0);
  const losses = trades.filter((t) => t.netPnl <= 0);
  const winRatePct = tradeCount > 0 ? (wins.length / tradeCount) * 100 : 0;

  const grossProfit = wins.reduce((s, t) => s + t.netPnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.netPnl, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

  const expectancy = tradeCount > 0 ? trades.reduce((s, t) => s + t.netPnl, 0) / tradeCount : 0;
  const avgHoldingBars = tradeCount > 0 ? trades.reduce((s, t) => s + t.holdingBars, 0) / tradeCount : 0;

  let peak = -Infinity;
  let maxDrawdownPct = 0;
  for (const point of equityCurve) {
    peak = Math.max(peak, point.equity);
    if (peak > 0) {
      const drawdown = ((point.equity - peak) / peak) * 100;
      maxDrawdownPct = Math.min(maxDrawdownPct, drawdown);
    }
  }

  // Sharpe is annualised with √252 trading days, so it must use one equity value
  // per day: for intraday strategies, each day's last value (for daily ones this
  // changes nothing).
  const endOfDay: number[] = [];
  let lastDay: number | null = null;
  for (const p of equityCurve) {
    const d = istDayAndMinute(p.time).day;
    if (d === lastDay) endOfDay[endOfDay.length - 1] = p.equity;
    else endOfDay.push(p.equity);
    lastDay = d;
  }
  const dailyReturns: number[] = [];
  for (let i = 1; i < endOfDay.length; i++) {
    const prev = endOfDay[i - 1];
    if (prev > 0) dailyReturns.push((endOfDay[i] - prev) / prev);
  }
  const meanReturn = dailyReturns.length > 0 ? dailyReturns.reduce((s, r) => s + r, 0) / dailyReturns.length : 0;
  const variance =
    dailyReturns.length > 0
      ? dailyReturns.reduce((s, r) => s + (r - meanReturn) ** 2, 0) / dailyReturns.length
      : 0;
  const stdDev = Math.sqrt(variance);
  const sharpeRatio = stdDev > 0 ? (meanReturn / stdDev) * Math.sqrt(252) : 0;

  return {
    totalReturnPct,
    cagrPct,
    winRatePct,
    profitFactor,
    maxDrawdownPct,
    sharpeRatio,
    expectancy,
    tradeCount,
    avgHoldingBars,
  };
}

export function runBacktest(
  candles: Candle[],
  entryCondition: ConditionNode,
  exitCondition: ConditionNode,
  config: BacktestConfig,
  aux?: AuxCandleMap,
): BacktestResult {
  const { entry, exit } = evaluateConditionsPerBar(candles, entryCondition, exitCondition, aux);
  // Margin-based stops/targets become price moves; leverage and the limits go to the engine as they are.
  const risk = config.riskOptions ? engineRisk(config.riskManagement ?? { stopLoss: null, target: null, trailingSl: null }, config.riskOptions) : null;
  const riskManagement = risk?.riskManagement ?? config.riskManagement;

  // ATR is only computed when a risk leg actually needs it — it's an
  // indicator series like any other, reused here rather than duplicating
  // the ATR math.
  let atrByTime: Map<number, number> | null = null;
  if (usesAtr(riskManagement, config.entryPlan)) {
    const atrPoints = computeIndicatorSeries(candles, "ATR", [DEFAULT_ATR_PERIOD]);
    atrByTime = new Map(atrPoints.map((p) => [p.time, p.value]));
  }
  const atrByTimeFinal = atrByTime;

  const engineConfig = {
    brokeragePercent: config.brokeragePercent,
    slippagePercent: config.slippagePercent,
    positionSizing: config.positionSizing,
    riskManagement,
    leverage: risk?.leverage,
    limits: risk?.limits,
    riskBasis: risk?.riskBasis,
    maxCapitalUsePercent: risk?.maxCapitalUsePercent,
    atrAtEntry: atrByTimeFinal ? (entryIdx: number) => atrByTimeFinal.get(candles[entryIdx]?.time) : undefined,
    maxPyramidEntries: config.maxPyramidEntries,
    direction: config.direction,
    session: config.session,
    entryOrder: config.entryOrder,
    entryPlan: config.entryPlan,
    levelSignals: levelSignalSeries(candles, config.entryPlan, aux ?? new Map()),
  };

  const trades: BacktestTradeResult[] = [];
  const equityCurve: EquityPoint[] = [];
  let state: EngineState = { cash: config.startingCapital, position: null };

  // A position sold in stages (targets) or built in stages (entry levels) is reported as ONE trade, so win rate, profit
  // factor and the trade list count positions, not pieces. Its parts are kept on the trade.
  let parts: BacktestTradeResult[] = [];
  let partLevels: (number | undefined)[] = [];
  let extraEntries: TradeLegs["entries"] = [];
  // A trading system: the concepts' signals, and the side of the position as the system chose it.
  const system = config.system;
  const sigs = system ? systemSignalSeries(candles, system, aux ?? new Map()) : null;
  const rules = system ? systemRules(system) : null;
  let sys = startSystem(config.startingCapital);
  let side: StrategyDirection | undefined = config.direction;
  for (let i = 0; i < candles.length; i++) {
    let stepped: StepResult;
    let tradeSide: StrategyDirection | undefined;
    if (system && sigs && rules) {
      const r = stepSystemBar(candles, i, sigs[i], sys, engineConfig, rules);
      sys = r.system;
      tradeSide = r.tradeSide;
      stepped = r.systemExit ? { ...r, exitReason: r.systemExit } : r;
      if (r.trade) parts.push({ ...r.trade, exitReason: stepped.exitReason, direction: r.tradeSide });
      if (r.trade) partLevels.push(r.targetLevel);
      state = r.state;
      if (r.entryLevel) extraEntries.push({ level: r.entryLevel.level, time: r.entryLevel.time, price: r.entryLevel.price, quantity: r.entryLevel.quantity });
      // A trade closed (the whole position): merge its parts; a reversal opens the next one at once.
      if (r.trade && (!state.position || r.systemExit === "reversal")) {
        trades.push({ ...mergePositionTrades(parts, partLevels, extraEntries), direction: tradeSide });
        parts = [];
        partLevels = [];
        extraEntries = [];
      }
      side = sys.side ?? side;
      equityCurve.push({ time: candles[i].time, equity: markToMarket(candles, i, state, sys.side ?? "LONG") });
      continue;
    }
    stepped = stepBar(candles, i, entry[i], exit[i], state, engineConfig);
    state = stepped.state;
    if (stepped.entryLevel) extraEntries.push({ level: stepped.entryLevel.level, time: stepped.entryLevel.time, price: stepped.entryLevel.price, quantity: stepped.entryLevel.quantity });
    if (stepped.trade) {
      parts.push({ ...stepped.trade, exitReason: stepped.exitReason });
      partLevels.push(stepped.targetLevel);
      if (!state.position) {
        trades.push(mergePositionTrades(parts, partLevels, extraEntries));
        parts = [];
        partLevels = [];
        extraEntries = [];
      }
    }

    equityCurve.push({ time: candles[i].time, equity: markToMarket(candles, i, state, config.direction) });
  }

  if (state.position) {
    const lastIdx = candles.length - 1;
    const openSide = system ? (sys.side ?? "LONG") : config.direction;
    const closed = forceClose(candles, lastIdx, state, { ...engineConfig, direction: openSide });
    state = closed.state;
    if (closed.trade) {
      parts.push({ ...closed.trade, exitReason: "end_of_data", ...(system ? { direction: openSide } : {}) });
      partLevels.push(undefined);
      trades.push({ ...mergePositionTrades(parts, partLevels, extraEntries), ...(system ? { direction: openSide } : {}) });
    }
    if (equityCurve.length > 0) equityCurve[equityCurve.length - 1] = { time: candles[lastIdx].time, equity: state.cash };
  }

  return {
    trades,
    equityCurve,
    metrics: computeMetrics(trades, equityCurve, config.startingCapital),
  };
}
