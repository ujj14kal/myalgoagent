import { marketDataProvider } from "@/lib/market-data";
import { evaluateConditionsPerBar } from "@/lib/strategy";
import { computeIndicatorSeries } from "@/lib/strategy/compute-series";
import { fetchAuxCandles } from "@/lib/strategy-aux-data";
import type { ConditionNode } from "@/lib/strategy";
import {
  stepBar,
  markToMarket,
  type EngineState,
  type PositionSizing,
  type RiskManagementConfig,
} from "@/lib/trading-engine/step";

const DEFAULT_ATR_PERIOD = 14;

export interface PaperSessionState {
  instrumentSymbol: string;
  entryCondition: ConditionNode;
  exitCondition: ConditionNode;
  brokeragePercent: number;
  slippagePercent: number;
  positionSizing: PositionSizing;
  riskManagement?: RiskManagementConfig;
  cash: number;
  positionEntryTime: number | null;
  positionEntryPrice: number | null;
  positionQuantity: number | null;
  // Carried forward across syncs so the trailing-stop math doesn't reset.
  positionFavorableExtreme: number | null;
  positionStopLossPrice: number | null;
  positionTargetPrice: number | null;
  lastSyncedTime: number | null;
}

function usesAtr(rm: RiskManagementConfig | undefined): boolean {
  if (!rm) return false;
  return [rm.stopLoss, rm.target, rm.trailingSl].some((leg) => leg?.enabled && leg.unit === "ATR_MULTIPLE");
}

export interface NewPaperOrder {
  side: "BUY" | "SELL";
  time: number;
  price: number;
  quantity: number;
  fees: number;
  netPnl: number | null;
}

export interface SyncResult {
  newOrders: NewPaperOrder[];
  cash: number;
  position: {
    entryTime: number;
    entryPrice: number;
    quantity: number;
    favorableExtreme: number;
    stopLossPrice: number | null;
    targetPrice: number | null;
  } | null;
  lastSyncedTime: number | null;
  suppressedEntrySignal: boolean;
  sizeTooSmall: boolean;
  equity: number;
}

/**
 * Advances a paper session forward using any real candles newer than its
 * `lastSyncedTime`. Reuses the exact same `stepBar` execution rules as
 * backtesting (next-bar-open fills, same slippage/brokerage math) so a
 * paper session behaves identically to how a backtest of the same period
 * would have. Indicators are computed over the full fetched range (they
 * need history before the "new" bars to be correct); only bars after
 * `lastSyncedTime` are actually acted on.
 */
export async function syncPaperSession(session: PaperSessionState, allowNewEntries: boolean): Promise<SyncResult> {
  const candles = await marketDataProvider.getHistoricalCandles(session.instrumentSymbol, "3mo", "1d");
  const aux = await fetchAuxCandles(session.entryCondition, session.exitCondition, session.instrumentSymbol, "3mo", "1d");

  const { entry, exit } = evaluateConditionsPerBar(candles, session.entryCondition, session.exitCondition, aux);

  let entryIdx: number | null = null;
  if (session.positionEntryTime !== null) {
    entryIdx = candles.findIndex((c) => c.time === session.positionEntryTime);
    if (entryIdx === -1) {
      throw new Error(
        "Open paper position's entry bar has rolled out of the fetched history window — cannot safely resume this session.",
      );
    }
  }

  let state: EngineState = {
    cash: session.cash,
    position:
      entryIdx !== null && session.positionEntryPrice !== null && session.positionQuantity !== null
        ? {
            entryIdx,
            entryPrice: session.positionEntryPrice,
            quantity: session.positionQuantity,
            favorableExtreme: session.positionFavorableExtreme ?? session.positionEntryPrice,
            stopLossPrice: session.positionStopLossPrice,
            targetPrice: session.positionTargetPrice,
          }
        : null,
  };

  let atrByTime: Map<number, number> | null = null;
  if (usesAtr(session.riskManagement)) {
    const atrPoints = computeIndicatorSeries(candles, "ATR", [DEFAULT_ATR_PERIOD]);
    atrByTime = new Map(atrPoints.map((p) => [p.time, p.value]));
  }
  const atrByTimeFinal = atrByTime;

  const engineConfig = {
    brokeragePercent: session.brokeragePercent,
    slippagePercent: session.slippagePercent,
    positionSizing: session.positionSizing,
    riskManagement: session.riskManagement,
    atrAtEntry: atrByTimeFinal ? (idx: number) => atrByTimeFinal.get(candles[idx]?.time) : undefined,
  };
  const newOrders: NewPaperOrder[] = [];
  let lastSyncedTime = session.lastSyncedTime;
  let suppressedEntrySignal = false;
  let sizeTooSmall = false;

  for (let i = 0; i < candles.length; i++) {
    if (session.lastSyncedTime !== null && candles[i].time <= session.lastSyncedTime) continue;

    if (!allowNewEntries && !state.position && entry[i]) {
      suppressedEntrySignal = true;
    }

    const wasFlat = !state.position;
    const stepped = stepBar(candles, i, allowNewEntries && entry[i], exit[i], state, engineConfig);
    state = stepped.state;
    if (stepped.sizeTooSmall) sizeTooSmall = true;

    if (stepped.trade) {
      newOrders.push({
        side: "SELL",
        time: stepped.trade.exitTime,
        price: stepped.trade.exitPrice,
        quantity: stepped.trade.quantity,
        fees: stepped.trade.fees,
        netPnl: stepped.trade.netPnl,
      });
    } else if (wasFlat && state.position) {
      newOrders.push({
        side: "BUY",
        time: candles[state.position.entryIdx].time,
        price: state.position.entryPrice,
        quantity: state.position.quantity,
        fees: 0,
        netPnl: null,
      });
    }

    lastSyncedTime = candles[i].time;
  }

  return {
    newOrders,
    cash: state.cash,
    position: state.position
      ? {
          entryTime: candles[state.position.entryIdx].time,
          entryPrice: state.position.entryPrice,
          quantity: state.position.quantity,
          favorableExtreme: state.position.favorableExtreme,
          stopLossPrice: state.position.stopLossPrice,
          targetPrice: state.position.targetPrice,
        }
      : null,
    lastSyncedTime,
    suppressedEntrySignal,
    sizeTooSmall,
    equity: candles.length > 0 ? markToMarket(candles, candles.length - 1, state) : state.cash,
  };
}
