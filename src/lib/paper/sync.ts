import type { CandleInterval, MarketDataProvider } from "@/lib/market-data";
import { engineEntryOrder, engineSession, paperSyncRange } from "@/lib/strategy/session";
import { evaluateConditionsPerBar } from "@/lib/strategy";
import { computeIndicatorSeries } from "@/lib/strategy/compute-series";
import { fetchAuxCandles } from "@/lib/strategy-aux-data";
import { levelSignalSeries, withLevelConditions } from "@/lib/strategy/plan-conditions";
import type { ConditionNode } from "@/lib/strategy";
import {
  stepBar,
  markToMarket,
  type EngineState,
  type EntryPlan,
  type ExitReason,
  type PositionSizing,
  type EngineMemo,
  type RiskManagementConfig,
  type RiskUnit,
  type StepResult,
  type StrategyDirection,
} from "@/lib/trading-engine/step";
import { engineRisk, type RiskOptions } from "@/lib/trading-engine/risk-options";
import { stepSystemBar, type SystemSignals, type SystemState } from "@/lib/trading-engine/system-step";
import { systemConditions, systemRules, systemSignalSeries } from "@/lib/system/signals";
import type { SystemRuntime } from "@/lib/system/types";

const DEFAULT_MAX_PYRAMID_ENTRIES = 1;

const DEFAULT_ATR_PERIOD = 14;

export interface PaperSessionState {
  /** Live deployments only: where signal prices come from, fixed at Go live (absent = the general feed). */
  dataSource?: "broker" | "general";
  instrumentSymbol: string;
  direction: StrategyDirection;
  entryCondition: ConditionNode;
  exitCondition: ConditionNode;
  brokeragePercent: number;
  slippagePercent: number;
  positionSizing: PositionSizing;
  riskManagement?: RiskManagementConfig;
  maxPyramidEntries?: number;
  /** Multi-level entry plan (swing): the first entry, further price levels and a holding limit. */
  entryPlan?: EntryPlan | null;
  /** Candle timeframe (default daily) and intraday session rules. */
  timeframe?: string;
  noEntryAfterMinute?: number | null;
  squareOffMinute?: number | null;
  productType?: string;
  orderType?: string;
  limitMode?: string | null;
  limitValue?: number | null;
  /** A resting limit entry order from the previous sync, if any. */
  pendingLimitPrice?: number | null;
  pendingLimitExpiresDay?: number | null;
  pendingLimitFromTime?: number | null;
  // When true, entry/exit signals are detected and reported but never
  // acted on — no order is placed, cash/position never change. Lets a
  // user watch a strategy's signals fire before trusting it with money.
  alertOnly?: boolean;
  cash: number;
  positionEntryTime: number | null;
  positionEntryPrice: number | null;
  positionQuantity: number | null;
  // Carried forward across syncs so the trailing-stop math doesn't reset.
  positionFavorableExtreme: number | null;
  positionStopLossPrice: number | null;
  positionTargetPrice: number | null;
  positionPyramidCount: number | null;
  /** Staged targets (TP1–TP3): shares at entry, how many targets are already taken, and the stop they set. */
  positionInitialQuantity?: number | null;
  positionTargetsHit?: number | null;
  positionLockedStopPrice?: number | null;
  /** Entry plan: the whole size the plan aims to build and the first fill's price the levels are measured from. */
  positionPlannedQuantity?: number | null;
  positionAnchorPrice?: number | null;
  /** Entry plan: the next further entry that can still fill. */
  positionLevelCursor?: number | null;
  /** Set by a target whose stop rule is TRAIL: the distance the stop trails the best price by. */
  positionTrailAfter?: { unit: RiskUnit; value: number } | null;
  /** TP/SL reference, leverage, break-even and system limits (omitted = the defaults). */
  riskOptions?: RiskOptions;
  /** What the daily-loss and drawdown limits remembered at the last sync. */
  engineMemo?: EngineMemo | null;
  /** Live trading: the leverage is already in `cash` (capital × buying power), so the engine mustn't apply it again. */
  leverageInCash?: boolean;
  /** A trading system: its concepts choose each position's side (entry/exit conditions and `direction` aren't used). */
  system?: SystemRuntime | null;
  /** Trading systems: the side of the open (or resting) position. */
  positionDirection?: StrategyDirection | null;
  /** Trading systems: how long an opposite setup has held, and a conflict waiting to resolve. */
  systemMemo?: SystemMemo | null;
  lastSyncedTime: number | null;
}

export type SystemMemo = Pick<SystemState, "oppositeRun" | "waiting">;

export function usesAtr(rm: RiskManagementConfig | undefined): boolean {
  if (!rm) return false;
  if ([rm.stopLoss, rm.target, rm.trailingSl, rm.breakEven].some((leg) => leg?.enabled && leg.unit === "ATR_MULTIPLE")) return true;
  return (rm.targets ?? []).some((t) => t.unit === "ATR_MULTIPLE" || ((t.lock.mode === "MARGIN" || t.lock.mode === "TRAIL") && t.lock.unit === "ATR_MULTIPLE"));
}

export interface NewPaperOrder {
  side: "BUY" | "SELL";
  time: number;
  price: number;
  quantity: number;
  fees: number;
  netPnl: number | null;
  /** Why this order happened: opening (entry rule / pyramid add) or closing (which rule closed it). */
  reason: "entry_rule" | "pyramid" | "entry_level" | ExitReason;
  /** The bar whose close triggered it (rule-based fills happen at the next bar's open). */
  signalTime: number;
  /** An entry filled by a limit order (at the limit or better), not at market. */
  viaLimit?: boolean;
  /** A staged target's sale (1–3): only part of the position is sold unless it is the last share. */
  targetLevel?: number;
  /** A further entry of a multi-level plan: which entry (2 = the first level after the signal's own). */
  entryLevel?: number;
  /** Trading systems: the side of the position this order opened or closed. */
  positionSide?: StrategyDirection;
  /** Trading systems: the side of the concept whose setup opened it. */
  conceptSide?: "BULLISH" | "BEARISH";
}

export interface SignalAlert {
  type: "entry" | "exit";
  time: number;
  price: number;
}

export interface SyncResult {
  newOrders: NewPaperOrder[];
  signalAlerts: SignalAlert[];
  cash: number;
  position: {
    entryTime: number;
    entryPrice: number;
    quantity: number;
    favorableExtreme: number;
    stopLossPrice: number | null;
    targetPrice: number | null;
    pyramidCount: number;
    initialQuantity: number | null;
    targetsHit: number;
    lockedStopPrice: number | null;
    plannedQuantity: number | null;
    anchorPrice: number | null;
    levelCursor: number;
    trailAfter: { unit: RiskUnit; value: number } | null;
  } | null;
  /** For the daily-loss and drawdown limits, saved for the next sync. */
  memo: EngineMemo | null;
  /** Trading systems: the open position's side and the system's memory, saved for the next sync. */
  positionDirection: StrategyDirection | null;
  systemMemo: SystemMemo | null;
  lastSyncedTime: number | null;
  /** A limit entry order still resting at the end of this sync (saved for the next one). */
  pendingEntry: { limitPrice: number; expiresDay: number; fromTime: number } | null;
  suppressedEntrySignal: boolean;
  sizeTooSmall: boolean;
  equity: number;
}

/**
 * Advances a forward test forward using any real candles newer than its
 * `lastSyncedTime`. Reuses the exact same `stepBar` execution rules as
 * backtesting (next-bar-open fills, same slippage/brokerage math) so a
 * forward test behaves identically to how a backtest of the same period
 * would have. Indicators are computed over the full fetched range (they
 * need history before the "new" bars to be correct); only bars after
 * `lastSyncedTime` are actually acted on.
 */
const INTERVAL_SECONDS: Partial<Record<CandleInterval, number>> = { "1m": 60, "2m": 120, "3m": 180, "5m": 300, "15m": 900, "30m": 1800, "60m": 3600, "4h": 4 * 3600, "1wk": 7 * 86_400 };
const IST_OFFSET = 19_800;
const MARKET_CLOSE_MINUTE = 15 * 60 + 30;

/** Drops a trailing candle that hasn't closed yet at `nowSec`. Intraday candles close after their interval
 * (the last one of the day at 15:30 IST); a daily candle closes at 15:30 IST on its day. */
export function closedCandles<T extends { time: number }>(candles: T[], timeframe: CandleInterval, nowSec = Math.floor(Date.now() / 1000)): T[] {
  const last = candles[candles.length - 1];
  if (!last) return candles;
  const istMidnight = Math.floor((last.time + IST_OFFSET) / 86_400) * 86_400 - IST_OFFSET;
  const sessionEnd = istMidnight + MARKET_CLOSE_MINUTE * 60;
  if (timeframe === "1wk") {
    // A weekly candle closes with the week's last session: Friday 15:30 IST of the week it starts in.
    const istDay = Math.floor((last.time + IST_OFFSET) / 86_400);
    const daysSinceMonday = (istDay + 3) % 7; // 1970-01-01 was a Thursday
    const weekEnd = (istDay - daysSinceMonday + 4) * 86_400 - IST_OFFSET + MARKET_CLOSE_MINUTE * 60;
    return weekEnd <= nowSec ? candles : candles.slice(0, -1);
  }
  const step = INTERVAL_SECONDS[timeframe];
  const closesAt = step ? Math.min(last.time + step, sessionEnd) : sessionEnd;
  return closesAt <= nowSec ? candles : candles.slice(0, -1);
}

/**
 * Some feeds (Yahoo) stamp the still-forming intraday candle with the time of its latest trade
 * (10:10:43) instead of its start (10:10:00), so the same candle reports a different time on every
 * read. Snap it back onto the candle grid, counted from the previous candle, so a position entered on
 * it can be found again on the next pass.
 */
export function snapFormingCandle<T extends { time: number }>(candles: T[], timeframe: CandleInterval): T[] {
  if (timeframe === "1wk") {
    // Yahoo stamps the still-forming week with its latest trade time (Monday 15:15) instead of the week's start (Monday
    // 00:00), so it would read differently on every pass. When the newest week's time of day differs from the one
    // before it, move it to its Monday at that same time of day. Weeks stamped by their first session are left alone.
    if (candles.length < 2) return candles;
    const last = candles[candles.length - 1];
    const prev = candles[candles.length - 2];
    const tod = (t: number) => (((t + IST_OFFSET) % 86_400) + 86_400) % 86_400;
    if (tod(last.time) === tod(prev.time)) return candles;
    const istDay = Math.floor((last.time + IST_OFFSET) / 86_400);
    const monday = istDay - ((istDay + 3) % 7);
    return [...candles.slice(0, -1), { ...last, time: monday * 86_400 + tod(prev.time) - IST_OFFSET }];
  }
  const step = INTERVAL_SECONDS[timeframe];
  if (!step || candles.length < 2) return candles;
  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const offset = (last.time - prev.time) % step;
  if (offset === 0 || last.time - prev.time < step) return candles;
  return [...candles.slice(0, -1), { ...last, time: last.time - offset }];
}

/** The candle a stored entry time belongs to: exact match, or the candle whose interval contains it. */
export function findEntryIndex(candles: { time: number }[], entryTime: number, timeframe: CandleInterval): number {
  const exact = candles.findIndex((c) => c.time === entryTime);
  if (exact !== -1) return exact;
  const step = INTERVAL_SECONDS[timeframe];
  if (!step) return -1;
  return candles.findIndex((c) => c.time <= entryTime && entryTime < c.time + step);
}

export async function syncPaperSession(
  session: PaperSessionState,
  allowNewEntries: boolean,
  market: MarketDataProvider,
  opts: { includeForming?: boolean } = {},
): Promise<SyncResult> {
  const timeframe = (session.timeframe ?? "1d") as CandleInterval;
  const range = paperSyncRange(timeframe);
  const fetched = snapFormingCandle(await market.getHistoricalCandles(session.instrumentSymbol, range, timeframe), timeframe);
  // A candle is only ever acted on once it has closed. A rule that fires on a
  // candle fills at the NEXT candle's open, so a candle is processed only once
  // its successor exists: forward tests wait for that next candle to close;
  // live deployments (includeForming) use the one forming right now, so the
  // order goes out at its open instead of a candle late.
  const candles = opts.includeForming ? fetched : closedCandles(fetched, timeframe);
  const actionable = opts.includeForming ? closedCandles(fetched, timeframe).length : candles.length - 1;
  const system = session.system ?? null;
  const aux = await fetchAuxCandles(system ? systemConditions(system) : session.entryCondition, withLevelConditions(session.exitCondition, session.entryPlan), session.instrumentSymbol, range, timeframe, market);

  // A trading system's concepts give each candle a bullish and a bearish side; a strategy has one entry and exit rule.
  const sigs: SystemSignals[] | null = system ? systemSignalSeries(candles, system, aux) : null;
  const { entry, exit } = sigs && system
    ? { entry: sigs.map((s) => s.bull || (s.bear && system.allowShort)), exit: sigs.map(() => false) }
    : evaluateConditionsPerBar(candles, session.entryCondition, session.exitCondition, aux);

  if (session.alertOnly) {
    const signalAlerts: SignalAlert[] = [];
    let lastSyncedTime = session.lastSyncedTime;
    for (let i = 0; i < candles.length; i++) {
      if (session.lastSyncedTime !== null && candles[i].time <= session.lastSyncedTime) continue;
      if (entry[i]) signalAlerts.push({ type: "entry", time: candles[i].time, price: candles[i].close });
      if (exit[i]) signalAlerts.push({ type: "exit", time: candles[i].time, price: candles[i].close });
      lastSyncedTime = candles[i].time;
    }
    return {
      newOrders: [],
      signalAlerts,
      cash: session.cash,
      position: null,
      memo: session.engineMemo ?? null,
      positionDirection: null,
      systemMemo: session.systemMemo ?? null,
      lastSyncedTime,
      pendingEntry: null,
      suppressedEntrySignal: false,
      sizeTooSmall: false,
      equity: session.cash,
    };
  }

  let entryIdx: number | null = null;
  if (session.positionEntryTime !== null) {
    entryIdx = findEntryIndex(candles, session.positionEntryTime, timeframe);
    if (entryIdx === -1) {
      throw new Error(
        "Open forward-test position's entry bar has rolled out of the fetched history window — cannot safely resume this session.",
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
            pyramidCount: session.positionPyramidCount ?? 1,
            // A moved stop (a taken target, break-even or a trail) carries across syncs whatever set it.
            lockedStopPrice: session.positionLockedStopPrice ?? null,
            trailAfter: session.positionTrailAfter ?? null,
            ...(session.riskManagement?.targets?.length
              ? {
                  initialQuantity: session.positionInitialQuantity ?? session.positionQuantity,
                  targetsHit: session.positionTargetsHit ?? 0,
                }
              : {}),
            ...(session.entryPlan ? { plannedQuantity: session.positionPlannedQuantity ?? session.positionQuantity, anchorPrice: session.positionAnchorPrice ?? session.positionEntryPrice, levelCursor: session.positionLevelCursor ?? Math.max(0, (session.positionPyramidCount ?? 1) - 1) } : {}),
          }
        : null,
    pendingEntry:
      session.pendingLimitPrice != null && session.pendingLimitExpiresDay != null && session.pendingLimitFromTime != null
        ? { limitPrice: session.pendingLimitPrice, expiresDay: session.pendingLimitExpiresDay, fromTime: session.pendingLimitFromTime }
        : null,
    memo: session.engineMemo ?? undefined,
  };

  // Margin-based stops/targets become price moves; leverage and the limits go to the engine as they are.
  const risk = session.riskOptions ? engineRisk(session.riskManagement ?? { stopLoss: null, target: null, trailingSl: null }, session.riskOptions) : null;
  const riskManagement = risk?.riskManagement ?? session.riskManagement;
  let atrByTime: Map<number, number> | null = null;
  if (usesAtr(riskManagement)) {
    const atrPoints = computeIndicatorSeries(candles, "ATR", [DEFAULT_ATR_PERIOD]);
    atrByTime = new Map(atrPoints.map((p) => [p.time, p.value]));
  }
  const atrByTimeFinal = atrByTime;

  const engineConfig = {
    brokeragePercent: session.brokeragePercent,
    slippagePercent: session.slippagePercent,
    positionSizing: session.positionSizing,
    riskManagement,
    leverage: session.leverageInCash ? 1 : risk?.leverage,
    limits: risk?.limits,
    riskBasis: risk?.riskBasis,
    maxCapitalUsePercent: risk?.maxCapitalUsePercent,
    atrAtEntry: atrByTimeFinal ? (idx: number) => atrByTimeFinal.get(candles[idx]?.time) : undefined,
    maxPyramidEntries: session.maxPyramidEntries ?? DEFAULT_MAX_PYRAMID_ENTRIES,
    direction: session.direction,
    entryPlan: session.entryPlan ?? undefined,
    levelSignals: levelSignalSeries(candles, session.entryPlan, aux),
    session: engineSession(
      { timeframe, noEntryAfterMinute: session.noEntryAfterMinute ?? null, squareOffMinute: session.squareOffMinute ?? null, productType: session.productType },
      session.entryCondition,
    ),
    entryOrder: engineEntryOrder({ orderType: session.orderType ?? "MARKET", limitMode: session.limitMode ?? null, limitValue: session.limitValue ?? null }),
  };
  // A long opens with a BUY and closes with a SELL; a short is the mirror. A trading system picks the side per position.
  const openSideOf = (d: StrategyDirection) => (d === "SHORT" ? "SELL" : "BUY") as "BUY" | "SELL";
  const closeSideOf = (d: StrategyDirection) => (d === "SHORT" ? "BUY" : "SELL") as "BUY" | "SELL";
  const rules = system ? systemRules(system) : null;
  let sys: SystemState = {
    engine: state,
    side: state.position || state.pendingEntry ? (session.positionDirection ?? session.direction) : null,
    oppositeRun: session.systemMemo?.oppositeRun ?? 0,
    waiting: session.systemMemo?.waiting ?? null,
  };
  const conceptOf = (d: StrategyDirection) => (d === "SHORT" ? "BEARISH" : "BULLISH") as "BULLISH" | "BEARISH";
  const newOrders: NewPaperOrder[] = [];
  let lastSyncedTime = session.lastSyncedTime;
  let suppressedEntrySignal = false;
  let sizeTooSmall = false;

  for (let i = 0; i < Math.min(actionable, candles.length - 1); i++) {
    if (session.lastSyncedTime !== null && candles[i].time <= session.lastSyncedTime) continue;

    if (!allowNewEntries && !state.position && entry[i]) {
      suppressedEntrySignal = true;
    }

    const wasFlat = !state.position;
    const prevQuantity = state.position?.quantity ?? 0;
    const prevEntryPrice = state.position?.entryPrice ?? 0;
    // The side before this candle (what an exit closes) and after it (what an entry or add opens).
    const sideBefore: StrategyDirection = sys.side ?? session.direction;
    let stepped: StepResult;
    let systemExit: "opposite_signal" | "reversal" | undefined;
    let reversedTo: StrategyDirection | undefined;
    if (sigs && rules) {
      const r = stepSystemBar(candles, i, sigs[i], { ...sys, engine: state }, engineConfig, rules, allowNewEntries);
      sys = r.system;
      stepped = r;
      systemExit = r.systemExit;
      if (r.systemExit === "reversal" && r.opened) reversedTo = r.opened;
    } else {
      stepped = stepBar(candles, i, allowNewEntries && entry[i], exit[i], state, engineConfig);
    }
    state = stepped.state;
    if (stepped.sizeTooSmall) sizeTooSmall = true;
    const sideAfter: StrategyDirection = sys.side ?? sideBefore;
    const sideTag = (d: StrategyDirection) => (system ? { positionSide: d } : {});

    // A further entry of a multi-level plan filled on this bar (before anything that closed the position on the same bar).
    if (stepped.entryLevel) {
      newOrders.push({
        side: openSideOf(sideBefore),
        time: stepped.entryLevel.time,
        price: stepped.entryLevel.price,
        quantity: stepped.entryLevel.quantity,
        fees: 0,
        netPnl: null,
        reason: "entry_level",
        signalTime: candles[i].time,
        entryLevel: stepped.entryLevel.level,
        ...sideTag(sideBefore),
      });
    }

    if (stepped.trade) {
      newOrders.push({
        side: closeSideOf(sideBefore),
        time: stepped.trade.exitTime,
        price: stepped.trade.exitPrice,
        quantity: stepped.trade.quantity,
        fees: stepped.trade.fees,
        netPnl: stepped.trade.netPnl,
        reason: systemExit ?? stepped.exitReason ?? "exit_rule",
        signalTime: candles[i].time,
        ...(stepped.targetLevel ? { targetLevel: stepped.targetLevel } : {}),
        ...sideTag(sideBefore),
      });
      // Exit and reverse: the opposite position opened at the same open the exit filled at.
      if (reversedTo && state.position) {
        newOrders.push({
          side: openSideOf(reversedTo),
          time: candles[state.position.entryIdx].time,
          price: state.position.entryPrice,
          quantity: state.position.quantity,
          fees: 0,
          netPnl: null,
          reason: "entry_rule",
          signalTime: candles[i].time,
          positionSide: reversedTo,
          conceptSide: conceptOf(reversedTo),
        });
      }
    } else if (wasFlat && state.position) {
      newOrders.push({
        side: openSideOf(sideAfter),
        time: candles[state.position.entryIdx].time,
        price: state.position.entryPrice,
        quantity: state.position.quantity,
        fees: 0,
        netPnl: null,
        reason: "entry_rule",
        signalTime: candles[i].time,
        viaLimit: engineConfig.entryOrder?.type === "LIMIT",
        ...(system ? { positionSide: sideAfter, conceptSide: conceptOf(sideAfter) } : {}),
      });
    } else if (!wasFlat && !stepped.entryLevel && state.position && state.position.quantity > prevQuantity) {
      // A pyramid add — reconstruct this leg's own fill price from the
      // blend (blendedPrice*totalQty = prevPrice*prevQty + legPrice*legQty)
      // since EnginePosition only tracks the blended average, not each leg.
      const addedQuantity = state.position.quantity - prevQuantity;
      const addedNotional = state.position.entryPrice * state.position.quantity - prevEntryPrice * prevQuantity;
      newOrders.push({
        side: openSideOf(sideAfter),
        time: candles[i + 1]?.time ?? candles[i].time,
        price: addedNotional / addedQuantity,
        quantity: addedQuantity,
        fees: 0,
        netPnl: null,
        reason: "pyramid",
        signalTime: candles[i].time,
        ...sideTag(sideAfter),
      });
    }

    lastSyncedTime = candles[i].time;
  }

  return {
    newOrders,
    signalAlerts: [],
    cash: state.cash,
    position: state.position
      ? {
          entryTime: candles[state.position.entryIdx].time,
          entryPrice: state.position.entryPrice,
          quantity: state.position.quantity,
          favorableExtreme: state.position.favorableExtreme,
          stopLossPrice: state.position.stopLossPrice,
          targetPrice: state.position.targetPrice,
          pyramidCount: state.position.pyramidCount,
          initialQuantity: state.position.initialQuantity ?? null,
          targetsHit: state.position.targetsHit ?? 0,
          lockedStopPrice: state.position.lockedStopPrice ?? null,
          plannedQuantity: state.position.plannedQuantity ?? null,
          anchorPrice: state.position.anchorPrice ?? null,
          levelCursor: state.position.levelCursor ?? 0,
          trailAfter: state.position.trailAfter ?? null,
        }
      : null,
    memo: state.memo ?? null,
    positionDirection: system ? (state.position || state.pendingEntry ? sys.side : null) : null,
    systemMemo: system ? { oppositeRun: sys.oppositeRun, waiting: sys.waiting } : null,
    lastSyncedTime,
    pendingEntry: state.pendingEntry ?? null,
    suppressedEntrySignal,
    sizeTooSmall,
    equity: candles.length > 0 ? markToMarket(candles, candles.length - 1, state, system ? (sys.side ?? "LONG") : session.direction) : state.cash,
  };
}
