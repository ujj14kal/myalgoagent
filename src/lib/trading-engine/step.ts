import type { Candle } from "@/lib/market-data";

export interface EnginePosition {
  entryIdx: number;
  entryPrice: number;
  quantity: number;
}

export interface EngineState {
  cash: number;
  position: EnginePosition | null;
}

export interface EngineConfig {
  brokeragePercent: number;
  slippagePercent: number;
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
): EngineTrade {
  const entryValue = pos.entryPrice * pos.quantity;
  const exitValue = exitPrice * pos.quantity;
  const grossPnl = exitValue - entryValue;
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
 * fill happens — both backtesting and paper trading call this so the two
 * can never silently disagree on execution rules.
 */
export function stepBar(
  candles: Candle[],
  i: number,
  entrySignal: boolean,
  exitSignal: boolean,
  state: EngineState,
  config: EngineConfig,
): { state: EngineState; trade?: EngineTrade } {
  const nextBar = candles[i + 1];

  if (!state.position && entrySignal && nextBar) {
    const fillPrice = nextBar.open * (1 + config.slippagePercent / 100);
    const quantity = Math.floor(state.cash / fillPrice);
    if (quantity > 0) {
      return { state: { ...state, position: { entryIdx: i + 1, entryPrice: fillPrice, quantity } } };
    }
  } else if (state.position && exitSignal && nextBar) {
    const fillPrice = nextBar.open * (1 - config.slippagePercent / 100);
    const trade = closeTrade(candles, state.position, i + 1, fillPrice, config.brokeragePercent);
    return { state: { cash: state.cash + trade.netPnl, position: null }, trade };
  }

  return { state };
}

/** Closes an open position at a given bar's close — used to finalize a
 * backtest at the end of its data range. Paper trading never calls this;
 * an open paper position just stays open until a real exit signal fires. */
export function forceClose(
  candles: Candle[],
  idx: number,
  state: EngineState,
  config: EngineConfig,
): { state: EngineState; trade?: EngineTrade } {
  if (!state.position) return { state };
  const trade = closeTrade(candles, state.position, idx, candles[idx].close, config.brokeragePercent);
  return { state: { cash: state.cash + trade.netPnl, position: null }, trade };
}

export function markToMarket(candles: Candle[], idx: number, state: EngineState): number {
  const unrealized = state.position ? (candles[idx].close - state.position.entryPrice) * state.position.quantity : 0;
  return state.cash + unrealized;
}
