import type { Candle } from "@/lib/market-data";

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

export type RiskUnit = "PERCENT" | "POINTS" | "ATR_MULTIPLE";

export interface RiskLeg {
  enabled: boolean;
  unit: RiskUnit;
  value: number;
}

export interface RiskManagementConfig {
  stopLoss: RiskLeg | null;
  target: RiskLeg | null;
  trailingSl: RiskLeg | null;
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
}

/** Converts a risk leg into an absolute price distance from the entry price. */
export function resolveRiskDistance(leg: RiskLeg, entryPrice: number, atrAtEntry: number | undefined): number | null {
  switch (leg.unit) {
    case "PERCENT":
      return entryPrice * (leg.value / 100);
    case "POINTS":
      return leg.value;
    case "ATR_MULTIPLE":
      return atrAtEntry !== undefined ? leg.value * atrAtEntry : null;
  }
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
  const stopLossDist = rm?.stopLoss?.enabled ? resolveRiskDistance(rm.stopLoss, entryPrice, atr) : null;
  const targetDist = rm?.target?.enabled ? resolveRiskDistance(rm.target, entryPrice, atr) : null;
  const sign = direction === "SHORT" ? -1 : 1;
  return {
    stopLossPrice: stopLossDist !== null ? entryPrice - sign * stopLossDist : null,
    targetPrice: targetDist !== null ? entryPrice + sign * targetDist : null,
  };
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
 * fill happens — both backtesting and paper trading call this so the two
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
export function stepBar(
  candles: Candle[],
  i: number,
  entrySignal: boolean,
  exitSignal: boolean,
  state: EngineState,
  config: EngineConfig,
): { state: EngineState; trade?: EngineTrade; sizeTooSmall?: boolean } {
  const nextBar = candles[i + 1];
  const direction = config.direction ?? "LONG";
  const isShort = direction === "SHORT";
  // A long buys to open (slippage costs you more) and sells to close
  // (slippage gets you less); a short is the mirror image on both sides.
  const openFillPrice = (open: number) => open * (1 + (isShort ? -1 : 1) * (config.slippagePercent / 100));
  const closeFillPrice = (open: number) => open * (1 + (isShort ? 1 : -1) * (config.slippagePercent / 100));

  if (state.position) {
    const bar = candles[i];
    const pos = state.position;
    const rm = config.riskManagement;
    const favorableExtreme = isShort ? Math.min(pos.favorableExtreme, bar.low) : Math.max(pos.favorableExtreme, bar.high);

    let trailingStopPrice: number | null = null;
    if (rm?.trailingSl?.enabled) {
      const atr = config.atrAtEntry?.(pos.entryIdx);
      const dist = resolveRiskDistance(rm.trailingSl, pos.entryPrice, atr);
      if (dist !== null) trailingStopPrice = isShort ? favorableExtreme + dist : favorableExtreme - dist;
    }

    let exitPrice: number | null = null;
    if (trailingStopPrice !== null && (isShort ? bar.high >= trailingStopPrice : bar.low <= trailingStopPrice)) {
      exitPrice = trailingStopPrice;
    } else if (pos.stopLossPrice !== null && (isShort ? bar.high >= pos.stopLossPrice : bar.low <= pos.stopLossPrice)) {
      exitPrice = pos.stopLossPrice;
    } else if (pos.targetPrice !== null && (isShort ? bar.low <= pos.targetPrice : bar.high >= pos.targetPrice)) {
      exitPrice = pos.targetPrice;
    }

    if (exitPrice !== null) {
      const trade = closeTrade(candles, pos, i, exitPrice, config.brokeragePercent, direction);
      return { state: { cash: state.cash + trade.netPnl, position: null }, trade };
    }

    if (exitSignal && nextBar) {
      const fillPrice = closeFillPrice(nextBar.open);
      const trade = closeTrade(candles, pos, i + 1, fillPrice, config.brokeragePercent, direction);
      return { state: { cash: state.cash + trade.netPnl, position: null }, trade };
    }

    const maxPyramidEntries = config.maxPyramidEntries ?? 1;
    if (entrySignal && nextBar && pos.pyramidCount < maxPyramidEntries) {
      const fillPrice = openFillPrice(nextBar.open);
      const addQuantity = computeQuantity(state.cash, fillPrice, config.positionSizing);
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
            },
          },
        };
      }
    }

    return { state: { ...state, position: { ...pos, favorableExtreme } } };
  }

  if (entrySignal && nextBar) {
    const fillPrice = openFillPrice(nextBar.open);
    const quantity = computeQuantity(state.cash, fillPrice, config.positionSizing);
    if (quantity > 0) {
      const atr = config.atrAtEntry?.(i + 1);
      const { stopLossPrice, targetPrice } = resolveRiskLevels(config.riskManagement, fillPrice, atr, direction);
      return {
        state: {
          ...state,
          position: {
            entryIdx: i + 1,
            entryPrice: fillPrice,
            quantity,
            favorableExtreme: fillPrice,
            stopLossPrice,
            targetPrice,
            pyramidCount: 1,
          },
        },
      };
    }
    return { state, sizeTooSmall: true };
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
}

export function markToMarket(candles: Candle[], idx: number, state: EngineState, direction: StrategyDirection = "LONG"): number {
  if (!state.position) return state.cash;
  const diff = candles[idx].close - state.position.entryPrice;
  const unrealized = (direction === "SHORT" ? -diff : diff) * state.position.quantity;
  return state.cash + unrealized;
}
