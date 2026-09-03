import type { Candle } from "@/lib/market-data";
import { evaluateConditionsPerBar } from "@/lib/strategy";
import type { ConditionNode } from "@/lib/strategy";

export interface BacktestConfig {
  startingCapital: number;
  brokeragePercent: number;
  slippagePercent: number;
}

export interface BacktestTradeResult {
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

  const dailyReturns: number[] = [];
  for (let i = 1; i < equityCurve.length; i++) {
    const prev = equityCurve[i - 1].equity;
    if (prev > 0) dailyReturns.push((equityCurve[i].equity - prev) / prev);
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
): BacktestResult {
  const { entry, exit } = evaluateConditionsPerBar(candles, entryCondition, exitCondition);

  function closeTrade(
    pos: { entryIdx: number; entryPrice: number; quantity: number },
    exitIdx: number,
    exitPrice: number,
  ): BacktestTradeResult {
    const entryValue = pos.entryPrice * pos.quantity;
    const exitValue = exitPrice * pos.quantity;
    const grossPnl = exitValue - entryValue;
    const fees = (entryValue + exitValue) * (config.brokeragePercent / 100);
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

  const trades: BacktestTradeResult[] = [];
  const equityCurve: EquityPoint[] = [];
  let capital = config.startingCapital;
  let position: { entryIdx: number; entryPrice: number; quantity: number } | null = null;

  for (let i = 0; i < candles.length; i++) {
    const nextBar = candles[i + 1];

    if (!position && entry[i] && nextBar) {
      const fillPrice = nextBar.open * (1 + config.slippagePercent / 100);
      const quantity = Math.floor(capital / fillPrice);
      if (quantity > 0) {
        position = { entryIdx: i + 1, entryPrice: fillPrice, quantity };
      }
    } else if (position && exit[i] && nextBar) {
      trades.push(closeTrade(position, i + 1, nextBar.open * (1 - config.slippagePercent / 100)));
      capital += trades.at(-1)!.netPnl;
      position = null;
    }

    const markPrice = candles[i].close;
    const unrealized = position ? (markPrice - position.entryPrice) * position.quantity : 0;
    equityCurve.push({ time: candles[i].time, equity: capital + unrealized });
  }

  if (position) {
    const lastIdx = candles.length - 1;
    trades.push(closeTrade(position, lastIdx, candles[lastIdx].close));
    capital += trades.at(-1)!.netPnl;
    if (equityCurve.length > 0) equityCurve[equityCurve.length - 1] = { time: candles[lastIdx].time, equity: capital };
  }

  return {
    trades,
    equityCurve,
    metrics: computeMetrics(trades, equityCurve, config.startingCapital),
  };
}
