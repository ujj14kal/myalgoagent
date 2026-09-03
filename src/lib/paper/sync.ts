import { marketDataProvider } from "@/lib/market-data";
import { evaluateConditionsPerBar } from "@/lib/strategy";
import type { ConditionNode } from "@/lib/strategy";
import { stepBar, type EngineState } from "@/lib/trading-engine/step";

export interface PaperSessionState {
  instrumentSymbol: string;
  entryCondition: ConditionNode;
  exitCondition: ConditionNode;
  brokeragePercent: number;
  slippagePercent: number;
  cash: number;
  positionEntryTime: number | null;
  positionEntryPrice: number | null;
  positionQuantity: number | null;
  lastSyncedTime: number | null;
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
  position: { entryTime: number; entryPrice: number; quantity: number } | null;
  lastSyncedTime: number | null;
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
export async function syncPaperSession(session: PaperSessionState): Promise<SyncResult> {
  const candles = await marketDataProvider.getHistoricalCandles(session.instrumentSymbol, "3mo", "1d");

  const { entry, exit } = evaluateConditionsPerBar(candles, session.entryCondition, session.exitCondition);

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
        ? { entryIdx, entryPrice: session.positionEntryPrice, quantity: session.positionQuantity }
        : null,
  };

  const engineConfig = { brokeragePercent: session.brokeragePercent, slippagePercent: session.slippagePercent };
  const newOrders: NewPaperOrder[] = [];
  let lastSyncedTime = session.lastSyncedTime;

  for (let i = 0; i < candles.length; i++) {
    if (session.lastSyncedTime !== null && candles[i].time <= session.lastSyncedTime) continue;

    const wasFlat = !state.position;
    const stepped = stepBar(candles, i, entry[i], exit[i], state, engineConfig);
    state = stepped.state;

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
        }
      : null,
    lastSyncedTime,
  };
}
