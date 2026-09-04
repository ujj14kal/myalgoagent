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

export type PositionSizingMode = "FULL_CAPITAL" | "FIXED_QUANTITY" | "FIXED_CAPITAL" | "PERCENT_OF_CAPITAL";

export interface PositionSizing {
  mode: PositionSizingMode;
  value: number | null;
}

export interface EngineConfig {
  brokeragePercent: number;
  slippagePercent: number;
  positionSizing: PositionSizing;
}

/**
 * Computes how many whole units to buy given available cash, the fill
 * price, and the configured sizing mode. Always rounds down to the
 * nearest whole tradable unit (universal convention — never round up)
 * and never exceeds what `cash` can actually afford, regardless of mode.
 */
export function computeQuantity(cash: number, fillPrice: number, sizing: PositionSizing): number {
  const affordable = Math.floor(cash / fillPrice);

  switch (sizing.mode) {
    case "FIXED_QUANTITY":
      return Math.min(Math.floor(sizing.value ?? 0), affordable);
    case "FIXED_CAPITAL":
      return Math.floor(Math.min(sizing.value ?? 0, cash) / fillPrice);
    case "PERCENT_OF_CAPITAL":
      return Math.floor((cash * (sizing.value ?? 0)) / 100 / fillPrice);
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
): { state: EngineState; trade?: EngineTrade; sizeTooSmall?: boolean } {
  const nextBar = candles[i + 1];

  if (!state.position && entrySignal && nextBar) {
    const fillPrice = nextBar.open * (1 + config.slippagePercent / 100);
    const quantity = computeQuantity(state.cash, fillPrice, config.positionSizing);
    if (quantity > 0) {
      return { state: { ...state, position: { entryIdx: i + 1, entryPrice: fillPrice, quantity } } };
    }
    return { state, sizeTooSmall: true };
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
}

export function markToMarket(candles: Candle[], idx: number, state: EngineState): number {
  const unrealized = state.position ? (candles[idx].close - state.position.entryPrice) * state.position.quantity : 0;
  return state.cash + unrealized;
}
