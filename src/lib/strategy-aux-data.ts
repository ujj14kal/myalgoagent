import { marketDataProvider } from "@/lib/market-data";
import type { CandleRange, CandleInterval } from "@/lib/market-data";
import { collectAuxRequirements, auxKey } from "@/lib/strategy";
import type { ConditionNode, AuxCandleMap } from "@/lib/strategy";

/**
 * Fetches every additional (instrument, timeframe) candle series a
 * strategy's conditions reference beyond its own base chart — see
 * `collectAuxRequirements`/`auxKey` in strategy/evaluate.ts. Used by both
 * backtesting and paper trading so multi-timeframe/cross-instrument
 * conditions behave identically in both.
 */
export async function fetchAuxCandles(
  entryCondition: ConditionNode,
  exitCondition: ConditionNode,
  baseSymbol: string,
  baseRange: CandleRange,
  baseInterval: CandleInterval,
): Promise<AuxCandleMap> {
  const requirements = collectAuxRequirements(entryCondition, exitCondition);
  const aux: AuxCandleMap = new Map();

  await Promise.all(
    requirements.map(async (req) => {
      const symbol = req.instrumentSymbol ?? baseSymbol;
      const interval = req.timeframe ?? baseInterval;
      try {
        const candles = await marketDataProvider.getHistoricalCandles(symbol, baseRange, interval);
        aux.set(auxKey(req.instrumentSymbol, req.timeframe), candles);
      } catch {
        // Leave this override unset — buildSeries treats a missing aux
        // entry as "can't be evaluated" (undefined per bar), so one bad
        // symbol/interval degrades that one condition rather than failing
        // the whole backtest/session.
      }
    }),
  );

  return aux;
}
