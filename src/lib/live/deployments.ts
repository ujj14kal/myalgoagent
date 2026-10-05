import { capitalProblem, fitToOrderLimit, INTRADAY_BUYING_POWER } from "@/lib/live/capital";
import "server-only";
import type { LiveDeployment, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logError, logWarn } from "@/lib/logger";
import { BrokerError } from "@/lib/brokers/adapters";
import { brokerById } from "@/lib/brokers/catalog";
import { LIVE_BROKERS } from "@/lib/brokers/live-brokers";
import { marketDataFor, type CandleInterval, type MarketDataProvider } from "@/lib/market-data";
import { brokerMarketData } from "@/lib/brokers/broker-data";
import type { BrokerId } from "@/lib/brokers/catalog";
import { closedCandles, syncPaperSession, type NewPaperOrder, type PaperSessionState } from "@/lib/paper/sync";
import { inMarketWindow } from "@/lib/paper/market-window";
import { rangeFor } from "@/lib/strategy/session";
import type { ConditionNode } from "@/lib/strategy";
import { event, LIVE_DEFAULTS, LiveCheckError, placeLiveOrder, refreshLiveOrder } from "./orders";
import { liveLog, liveLogThrottled, plainReason } from "./engine-log";
import { conditionToText } from "@/lib/strategy/format";
import { resyncStaged } from "./resync";
import { parseTargets } from "@/lib/trading-engine/targets-config";

// Live deployments: a strategy trading on the user's own broker. The forward-
// testing engine decides (same rules, same risk exits, same square-off); every
// buy or sell it makes becomes a real market order — sent at once (AUTO) or
// after the user's tap (CONFIRM). Orders still pass every live-order check
// (caps, kill switch, market hours, symbol read-back). The real position is
// tracked from the broker's fills, and a rejected order pauses the deployment.

export type PendingSignal = { side: "BUY" | "SELL"; quantity: number; reason: string; signalTime: number; createdAt: string; purpose: "strategy" | "exit"; /** A staged target's sale: only this many shares, not the whole position. */ targetLevel?: number };
const READY_WITHIN_MS = 24 * 3_600_000;
const FINAL = new Set(["FILLED", "CANCELLED", "REJECTED", "FAILED"]);
/** An order with no broker id and no record at the broker this long after being sent never arrived. */
const UNCONFIRMED_MS = 3 * 60_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const stock = (d: { instrumentSymbol: string }) => d.instrumentSymbol.replace(/\.NS$/, "");
const brokerName = (d: { broker: string }) => brokerById(d.broker)?.name ?? d.broker;
const rupees = (n: number | null | undefined) => (n == null ? "" : `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`);
const lg = (d: { userId: string; id: string }, level: "INFO" | "OK" | "WARN" | "ERROR", message: string) => liveLog(d.userId, d.id, level, message);

const REASON: Record<string, string> = {
  entry_rule: "entry rule",
  pyramid: "adding to the position",
  exit_rule: "exit rule",
  stop_loss: "stop-loss",
  target: "target",
  trailing_stop: "trailing stop",
  square_off: "intraday square-off",
  locked_profit: "the profit locked by an earlier target",
};
const reasonText = (r: string) => REASON[r] ?? r.replace(/_/g, " ");

async function notify(userId: string, message: string, type: "ORDER_FILLED" | "RISK_EVENT" | "SIGNAL_ALERT" | "SESSION_STOPPED" = "SIGNAL_ALERT") {
  await prisma.notification.create({ data: { userId, type, message, link: "/app/live-trading" } }).catch(() => {});
}

// ---------- start / control ----------

export async function startDeployment(userId: string, input: { strategyId: string; broker: string; capital: number; mode: "AUTO" | "CONFIRM" }): Promise<LiveDeployment> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { liveTradingEnabledAt: true, status: true } });
  if (!user?.liveTradingEnabledAt || user.status !== "ACTIVE") throw new LiveCheckError("Live trading isn't switched on for your account.");
  if (!LIVE_BROKERS[input.broker as keyof typeof LIVE_BROKERS]) throw new LiveCheckError("Live orders aren't available for this broker yet.");
  const conn = await prisma.brokerConnection.findUnique({ where: { userId_broker: { userId, broker: input.broker } }, select: { liveReadyAt: true, status: true, tokenExpiresAt: true } });
  const name = brokerById(input.broker)?.name ?? input.broker;
  if (!conn || conn.status !== "CONNECTED" || !conn.tokenExpiresAt || conn.tokenExpiresAt < new Date()) throw new LiveCheckError(`Log in to ${name} for today first.`);
  if (!conn.liveReadyAt || Date.now() - conn.liveReadyAt.getTime() > READY_WITHIN_MS) throw new LiveCheckError(`Run "Check I'm ready" for ${name} on the Live Trading page first (it places no order).`);
  if (!(input.capital > 0) || input.capital > 1e8) throw new LiveCheckError("Enter the capital this strategy may use.");

  const s = await prisma.strategy.findFirst({ where: { id: input.strategyId, userId, status: { not: "DELETED" } }, include: { instrument: true } });
  if (!s) throw new LiveCheckError("Strategy not found.");
  if (s.mode === "WEBHOOK") throw new LiveCheckError("Webhook strategies run as forward tests only.");
  if (!s.instrument.symbol.endsWith(".NS")) throw new LiveCheckError(`${s.instrument.symbol} can't be traded — live strategies trade NSE stocks.`);
  if (s.direction === "SHORT" && s.productType !== "INTRADAY") throw new LiveCheckError("A short strategy must be intraday.");
  const dup = await prisma.liveDeployment.findFirst({ where: { userId, strategyId: s.id, broker: input.broker, status: { in: ["ACTIVE", "PAUSED"] } } });
  if (dup) throw new LiveCheckError(`This strategy is already live on ${name}.`);

  // Start from now: the engine only acts on candles that close after this point.
  const tf = s.timeframe as CandleInterval;
  // Prices for this strategy's signals come from the user's own broker when it supplies data, and
  // that choice is fixed for the deployment's life (switching sources mid-position would break
  // candle matching). Otherwise the general feed, with the reason logged for the user.
  let dataSource: "broker" | "general" = "general";
  let dataNote = "";
  let raw;
  try {
    raw = await brokerMarketData(userId, input.broker as BrokerId).getHistoricalCandles(s.instrument.symbol, rangeFor(s.timeframe, "1mo", "standard"), tf);
    dataSource = "broker";
  } catch (err) {
    dataNote = err instanceof Error ? err.message : "";
    const general = marketDataFor(userId, "trading");
    raw = await general.getHistoricalCandles(s.instrument.symbol, rangeFor(s.timeframe, "1mo", general.depth), tf);
  }
  const candles = closedCandles(raw, tf);
  if (!candles.length) throw new LiveCheckError("No recent prices for this stock.");
  // A strategy whose capital can't buy its first position would watch forever and never trade.
  const sizing = { mode: s.positionSizingMode, value: s.positionSizingValue };
  // Intraday trades are margin trades: the broker lends buying power, so the engine may size up to that multiple of the capital.
  const leverage = s.productType === "INTRADAY" ? INTRADAY_BUYING_POWER : 1;
  const tooSmall = capitalProblem(sizing, input.capital, candles.at(-1)!.close * 1.0005, s.instrument.symbol.replace(/\.NS$/, ""), leverage);
  if (tooSmall) throw new LiveCheckError(tooSmall);

  const state: PaperSessionState = {
    instrumentSymbol: s.instrument.symbol,
    direction: s.direction,
    entryCondition: s.entryCondition as unknown as ConditionNode,
    exitCondition: s.exitCondition as unknown as ConditionNode,
    brokeragePercent: 0.03,
    slippagePercent: 0.05,
    positionSizing: { mode: s.positionSizingMode, value: s.positionSizingValue },
    riskManagement: {
      stopLoss: s.stopLossEnabled ? { enabled: true, unit: s.stopLossUnit!, value: s.stopLossValue! } : null,
      target: s.targetEnabled ? { enabled: true, unit: s.targetUnit!, value: s.targetValue! } : null,
      trailingSl: s.trailingSlEnabled ? { enabled: true, unit: s.trailingSlUnit!, value: s.trailingSlValue! } : null,
      targets: parseTargets(s.targetsConfig),
    },
    maxPyramidEntries: 1,
    timeframe: s.timeframe,
    noEntryAfterMinute: s.noEntryAfterMinute,
    squareOffMinute: s.squareOffMinute,
    productType: s.productType,
    orderType: "MARKET",
    limitMode: null,
    limitValue: null,
    cash: input.capital * leverage,
    positionEntryTime: null,
    positionEntryPrice: null,
    positionQuantity: null,
    positionFavorableExtreme: null,
    positionStopLossPrice: null,
    positionTargetPrice: null,
    lastSyncedTime: candles.at(-1)!.time,
    dataSource,
  } as PaperSessionState;

  const d = await prisma.liveDeployment.create({
    data: {
      userId,
      strategyId: s.id,
      strategyName: s.name,
      instrumentSymbol: s.instrument.symbol,
      broker: input.broker,
      mode: input.mode,
      capital: input.capital,
      product: s.productType === "INTRADAY" ? "MIS" : "CNC",
      engineState: state as unknown as Prisma.InputJsonValue,
      lastSyncedTime: state.lastSyncedTime,
    },
  });
  await lg(d, "OK", `Went live on ${name} with ${rupees(input.capital)} of capital (${s.productType === "INTRADAY" ? "intraday" : "delivery"}). ${input.mode === "AUTO" ? "Orders are sent automatically when the rules fire." : "Each signal waits for your confirmation."} Enter when: ${conditionToText(state.entryCondition)}. Exit when: ${conditionToText(state.exitCondition)}. It is checked every few seconds while the market is open.`);
  await lg(d, dataSource === "broker" ? "OK" : "INFO", dataSource === "broker" ? `Prices for its signals come straight from your ${name} account.` : `Prices for its signals come from the general price feed (Yahoo, not an official exchange source)${dataNote ? `: ${dataNote}` : "."}`);
  await notify(userId, `“${s.name}” is live on ${name} (${input.mode === "AUTO" ? "orders go out automatically" : "each signal waits for your confirmation"}).`);
  return d;
}

/** The price source fixed at Go live; deployments from before broker data existed stay on the general feed. */
function dataFor(d: LiveDeployment): MarketDataProvider {
  return (d.engineState as { dataSource?: string }).dataSource === "broker" ? brokerMarketData(d.userId, d.broker as BrokerId) : marketDataFor(d.userId, "trading");
}

/** The engine's position must match the broker's: when nothing is really held, the engine is flat too. */
function flatten(state: PaperSessionState): PaperSessionState {
  return { ...state, positionEntryTime: null, positionEntryPrice: null, positionQuantity: null, positionFavorableExtreme: null, positionStopLossPrice: null, positionTargetPrice: null, positionInitialQuantity: null, positionTargetsHit: 0, positionLockedStopPrice: null } as PaperSessionState;
}

export async function setDeploymentStatus(userId: string, id: string, status: "ACTIVE" | "PAUSED" | "STOPPED") {
  const d = await prisma.liveDeployment.findFirst({ where: { id, userId } });
  if (!d) throw new LiveCheckError("Deployment not found.");
  if (d.status === "STOPPED") throw new LiveCheckError("This deployment is stopped — start it again from the strategy.");
  // Resuming after a rejected order: line the engine up with what's really held.
  await lg(d, status === "ACTIVE" ? "INFO" : "WARN", status === "ACTIVE" ? "You resumed this strategy." : status === "PAUSED" ? "You paused this strategy: it sends no orders until you resume it." : "You stopped this strategy. It sends no more orders; a position it opened stays open until you close it.");
  const real = status === "ACTIVE" ? await reconcile(d) : null;
  const current = d.engineState as unknown as PaperSessionState;
  const engineState = real && real.qty === 0 && !real.working
    ? (flatten(current) as unknown as Prisma.InputJsonValue)
    : real && real.qty > 0 && !real.working
      ? (resyncStaged(current, real.qty) as unknown as Prisma.InputJsonValue)
      : undefined;
  return prisma.liveDeployment.update({
    where: { id },
    data: {
      status,
      ...(engineState ? { engineState } : {}),
      ...(status === "STOPPED" ? { stoppedAt: new Date(), pendingSignals: [] } : {}),
      ...(status === "ACTIVE" ? { lastError: null } : {}),
    },
  });
}

// ---------- the loop ----------

/** Brings the real position up to date from this deployment's orders at the broker. */
async function reconcile(d: LiveDeployment): Promise<{ qty: number; avg: number | null; working: boolean }> {
  const orders = await prisma.liveOrder.findMany({ where: { deploymentId: d.id }, orderBy: { createdAt: "asc" } });
  let working = false;
  for (const o of orders) {
    if (FINAL.has(o.status)) continue;
    const before = { status: o.status, filled: o.filledQuantity };
    try {
      // An order whose answer was lost has no broker id yet: it is looked up by our reference.
      const fresh = await refreshLiveOrder(o.id, d.userId);
      Object.assign(o, fresh);
      if (!FINAL.has(fresh.status)) working = true;
      if (fresh.status !== before.status || fresh.filledQuantity !== before.filled) await logOrderChange(d, fresh);
    } catch {
      if (!o.brokerOrderId && Date.now() - o.createdAt.getTime() > UNCONFIRMED_MS) {
        // The broker has no record of it after several minutes: it never arrived, so it must not block the strategy forever.
        const failed = await prisma.liveOrder.update({ where: { id: o.id }, data: { status: "FAILED", rejectReason: "No record of this order at the broker after 3 minutes — treated as not placed.", closedAt: new Date() } });
        await event(o.id, "error", { code: "never_arrived", detail: "no record at the broker after 3 minutes" });
        Object.assign(o, failed);
        await lg(d, "WARN", `${brokerName(d)} has no record of the ${o.side} ${o.quantity} ${stock(d)} order we tried to send, so it is treated as not placed. Check ${brokerName(d)} to be sure.`);
      } else {
        working = true;
      }
    }
  }
  // Net filled quantity (long: buys add; short: sells add) and the average price of the open part.
  const openSide = (d.engineState as unknown as PaperSessionState).direction === "SHORT" ? "SELL" : "BUY";
  let qty = 0;
  let cost = 0;
  for (const o of orders) {
    if (!o.filledQuantity) continue;
    const px = o.averagePrice ?? o.price ?? 0;
    if (o.side === openSide) {
      cost += px * o.filledQuantity;
      qty += o.filledQuantity;
    } else {
      const closing = Math.min(o.filledQuantity, qty);
      cost -= qty ? (cost / qty) * closing : 0;
      qty -= closing;
    }
  }
  return { qty, avg: qty ? cost / qty : null, working };
}

async function logOrderChange(d: LiveDeployment, o: { side: string; quantity: number; filledQuantity: number; averagePrice: number | null; status: string; rejectReason: string | null; brokerOrderId: string | null }) {
  const what = `${o.side} ${o.quantity} ${stock(d)}`;
  if (o.status === "FILLED") return lg(d, "OK", `${brokerName(d)} confirms the ${what} order is filled${o.averagePrice ? ` at ${rupees(o.averagePrice)}` : ""}.`);
  if (o.status === "PARTIALLY_FILLED") return lg(d, "INFO", `${brokerName(d)} has filled ${o.filledQuantity} of ${o.quantity} so far on the ${what} order.`);
  if (o.status === "REJECTED" || o.status === "FAILED") return lg(d, "ERROR", `${brokerName(d)} refused the ${what} order: ${plainReason(o.rejectReason, brokerName(d))}.`);
  if (o.status === "CANCELLED") return lg(d, "WARN", `The ${what} order was cancelled${o.filledQuantity ? ` after ${o.filledQuantity} filled` : ""}.`);
}

async function send(d: LiveDeployment, o: { side: "BUY" | "SELL"; quantity: number; purpose: "strategy" | "exit"; reason: string }) {
  const what = `${o.side} ${o.quantity} ${stock(d)}`;
  const placed = await placeLiveOrder({
    userId: d.userId,
    broker: d.broker,
    instrumentSymbol: d.instrumentSymbol,
    side: o.side,
    quantity: o.quantity,
    orderType: "MARKET",
    product: d.product as "CNC" | "MIS",
    purpose: o.purpose,
    reason: `Strategy “${d.strategyName}”: ${o.reason}`,
    deploymentId: d.id,
  });
  if (placed.status === "OPEN") await lg(d, "INFO", `Sent ${what} to ${brokerName(d)} (${d.product === "MIS" ? "intraday" : "delivery"}${placed.orderType === "MARKET" ? ", market order" : ", protected limit order"}). ${brokerName(d)} accepted it${placed.brokerOrderId ? ` as order ${placed.brokerOrderId}` : ""}. Reason: ${o.reason}.`);
  else if (placed.status === "CREATED") await lg(d, "WARN", `Sent ${what} but ${brokerName(d)} didn't answer in time. We'll look it up by its reference and will not send it twice.`);
  // Confirm quickly instead of waiting for the next check: most market orders fill within a second or two.
  let order = placed;
  for (let i = 0; i < 4 && !FINAL.has(order.status); i++) {
    await sleep(1500);
    try {
      order = await refreshLiveOrder(order.id, d.userId);
    } catch {
      break;
    }
  }
  if (order.status !== placed.status || order.filledQuantity !== placed.filledQuantity || FINAL.has(order.status)) await logOrderChange(d, order);
  else if (placed.status === "OPEN") await lg(d, "INFO", `The ${what} order is still open at ${brokerName(d)}; checking it again on the next pass.`);
  if (order.status === "REJECTED" || order.status === "FAILED") {
    await prisma.liveDeployment.update({ where: { id: d.id }, data: { status: "PAUSED", lastError: `${o.side} ${o.quantity} was not accepted: ${plainReason(order.rejectReason ?? order.status, brokerName(d))}` } });
    await lg(d, "ERROR", `Paused: no more orders are sent until you resume. ${plainReason(order.rejectReason ?? order.status, brokerName(d))}.`);
    await notify(d.userId, `“${d.strategyName}” paused — ${brokerName(d)} didn't accept a ${o.side} order: ${plainReason(order.rejectReason ?? order.status, brokerName(d))}.`, "RISK_EVENT");
  }
  return order;
}

/** A check started this recently owns the strategy; a second run (schedules can overlap) skips it. */
const CLAIM_MS = 10_000;

/** One pass for one deployment: reconcile fills, run the rules on the newest candle, act on what they decided. */
export async function runDeployment(id: string): Promise<"idle" | "acted" | "paused"> {
  const d = await prisma.liveDeployment.findUnique({ where: { id } });
  if (!d || d.status !== "ACTIVE") return "idle";
  if (!inMarketWindow(new Date())) return "idle";
  // One check at a time per strategy: if another run took it moments ago (or is still going), leave it.
  const claimed = await prisma.liveDeployment.updateMany({
    where: { id, status: "ACTIVE", OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: new Date(Date.now() - CLAIM_MS) } }] },
    data: { lastCheckedAt: new Date() },
  });
  if (claimed.count === 0) return "idle";

  const real = await reconcile(d);
  const state = d.engineState as unknown as PaperSessionState;
  const risk = await prisma.riskSettings.findUnique({ where: { userId: d.userId }, select: { killSwitchEnabled: true, liveMaxOrderValue: true } });
  const maxOrderValue = risk?.liveMaxOrderValue ?? LIVE_DEFAULTS.maxOrderValue;
  const market = dataFor(d);
  let result;
  try {
    // Same engine as forward testing; the forming candle is included so a signal on the last closed candle is sent right away.
    result = await syncPaperSession(state, !risk?.killSwitchEnabled, market, { includeForming: true });
  } catch (err) {
    logError("live.deployment.sync", err, { id });
    await liveLogThrottled(`price:${id}`, 5 * 60_000, d.userId, id, "WARN", `Couldn't read ${stock(d)} prices${(d.engineState as { dataSource?: string }).dataSource === "broker" ? ` from ${brokerName(d)}` : ""} this time. Nothing is sent while prices are unavailable; trying again in a few seconds.`);
    await prisma.liveDeployment.update({ where: { id }, data: { lastCheckedAt: new Date(), lastError: "Couldn't read prices this time — will retry." } });
    return "idle";
  }

  const pending = (d.pendingSignals as unknown as PendingSignal[]) ?? [];
  let acted = false;
  for (const o of result.newOrders as NewPaperOrder[]) {
    const opening = o.reason === "entry_rule" || o.reason === "pyramid";
    // Exits close what's really held; nothing to close = nothing to send.
    // A staged target sells only its own share of the position; every other exit closes whatever is held.
    let quantity = opening ? o.quantity : o.targetLevel ? Math.min(o.quantity, real.qty) : real.qty;
    if (quantity <= 0) continue;
    if (opening && (real.qty > 0 || real.working)) {
      await liveLogThrottled(`skip:${id}`, 5 * 60_000, d.userId, id, "INFO", `The entry rules fired, but ${real.working ? "an earlier order is still being settled" : "the position is already open"}, so no second order was sent (one position at a time).`);
      continue;
    }
    await lg(d, "INFO", `${opening ? "Entry" : o.targetLevel ? `Target ${o.targetLevel}` : "Exit"} signal: ${o.targetLevel ? `Target ${o.targetLevel} reached, selling ${quantity} of the position` : reasonText(o.reason)} at about ${rupees(o.price)}.`);
    let note = "";
    if (opening) {
      // The user's per-order limit still applies: shrink an over-limit order instead of having it refused (which would pause the strategy).
      const fit = fitToOrderLimit(quantity, o.price, maxOrderValue);
      if (fit.quantity < 1) {
        await lg(d, "ERROR", `One share costs about ${rupees(o.price)}, above your ${rupees(maxOrderValue)} per-order limit, so nothing was sent and the strategy is paused. Raise the limit in Risk Controls and resume.`);
        await prisma.liveDeployment.update({ where: { id }, data: { status: "PAUSED", lastError: `One share costs about ₹${Math.round(o.price).toLocaleString("en-IN")}, above your ₹${maxOrderValue.toLocaleString("en-IN")} per-order limit — raise it in Risk Controls.` } });
        await notify(d.userId, `“${d.strategyName}” paused — one share is above your per-order limit (Risk Controls).`, "RISK_EVENT");
        return "paused";
      }
      if (fit.reduced) await lg(d, "WARN", `Order size cut from ${quantity} to ${fit.quantity} shares to stay inside your ${rupees(maxOrderValue)} per-order limit.`);
      if (fit.reduced) note = ` (reduced from ${quantity} to ${fit.quantity} shares to fit your ₹${maxOrderValue.toLocaleString("en-IN")} per-order limit)`;
      quantity = fit.quantity;
    }
    const sig: PendingSignal = { side: o.side, quantity, reason: (o.targetLevel ? `Target ${o.targetLevel}` : reasonText(o.reason)) + note, signalTime: o.signalTime, createdAt: new Date().toISOString(), purpose: opening ? "strategy" : "exit", ...(o.targetLevel ? { targetLevel: o.targetLevel } : {}) };
    if (d.mode === "AUTO") {
      try {
        await send(d, sig);
        acted = true;
      } catch (err) {
        const why = err instanceof LiveCheckError ? err.message : err instanceof BrokerError ? (err.failure.detail ?? err.failure.code) : "unexpected error";
        if (!(err instanceof LiveCheckError) && !(err instanceof BrokerError)) logError("live.deployment.send", err, { id });
        await lg(d, "ERROR", `The ${sig.side} ${sig.quantity} ${stock(d)} order was not sent: ${plainReason(why, brokerName(d))}. Paused until you resume.`);
        await prisma.liveDeployment.update({ where: { id }, data: { status: "PAUSED", lastError: `${sig.side} ${sig.quantity} not sent: ${why}` } });
        await notify(d.userId, `“${d.strategyName}” paused — a ${sig.side} order couldn't be sent: ${why}`, "RISK_EVENT");
        break;
      }
    } else {
      pending.push(sig);
      await lg(d, "INFO", `${sig.side} ${sig.quantity} ${stock(d)} is waiting for your confirmation on Live Trading (${sig.reason}).`);
      await notify(d.userId, `“${d.strategyName}”: ${sig.side} ${sig.quantity} ${d.instrumentSymbol.replace(/\.NS$/, "")} (${sig.reason}) — confirm on Live Trading to send it.`);
      acted = true;
    }
  }

  const next: PaperSessionState = {
    ...state,
    cash: result.cash,
    positionEntryTime: result.position?.entryTime ?? null,
    positionEntryPrice: result.position?.entryPrice ?? null,
    positionQuantity: result.position?.quantity ?? null,
    positionFavorableExtreme: result.position?.favorableExtreme ?? null,
    positionStopLossPrice: result.position?.stopLossPrice ?? null,
    positionTargetPrice: result.position?.targetPrice ?? null,
    positionInitialQuantity: result.position?.initialQuantity ?? null,
    positionTargetsHit: result.position?.targetsHit ?? 0,
    positionLockedStopPrice: result.position?.lockedStopPrice ?? null,
    lastSyncedTime: result.lastSyncedTime,
  } as PaperSessionState;
  const after = acted && d.mode === "AUTO" ? await reconcile(d) : real;
  const current = await prisma.liveDeployment.findUnique({ where: { id }, select: { status: true } });
  await prisma.liveDeployment.update({
    where: { id },
    data: {
      engineState: next as unknown as Prisma.InputJsonValue,
      lastSyncedTime: result.lastSyncedTime,
      positionQty: after.qty,
      positionAvgPrice: after.avg,
      pendingSignals: pending as unknown as Prisma.InputJsonValue,
      lastCheckedAt: new Date(),
      ...(current?.status === "ACTIVE" ? { lastError: null } : {}),
    },
  });
  if (!acted && current?.status === "ACTIVE") {
    const held = after.qty > 0 ? `holding ${after.qty} ${stock(d)}${after.avg ? ` bought at ${rupees(after.avg)}` : ""}` : "no open position";
    const sk = risk?.killSwitchEnabled ? " The kill switch is on, so no new entries are sent." : "";
    await liveLogThrottled(`pass:${id}`, 60_000, d.userId, id, "INFO", `Checked ${stock(d)} against the rules: ${held}; nothing to do yet.${sk}`);
  }
  return current?.status === "PAUSED" ? "paused" : acted ? "acted" : "idle";
}

/** One pass over every active deployment (from the always-on engine, or the scheduled job as the fallback). */
export async function runLiveDeployments(budgetMs = 20_000) {
  const started = Date.now();
  const list = await prisma.liveDeployment.findMany({ where: { status: "ACTIVE" }, select: { id: true }, orderBy: { lastCheckedAt: { sort: "asc", nulls: "first" } } });
  let acted = 0;
  let failed = 0;
  for (const d of list) {
    if (Date.now() - started > budgetMs) break;
    try {
      if ((await runDeployment(d.id)) === "acted") acted++;
    } catch (err) {
      failed++;
      logError("live.deployment", err, { id: d.id });
      const row = await prisma.liveDeployment.findUnique({ where: { id: d.id }, select: { userId: true } }).catch(() => null);
      if (row) await liveLogThrottled(`crash:${d.id}`, 5 * 60_000, row.userId, d.id, "ERROR", "Something unexpected went wrong while checking this strategy. It was not paused and will be retried in a few seconds; our team has been alerted through the logs.");
    }
  }
  if (failed) logWarn("live.deployments", "some deployments failed this pass", { failed });
  return { total: list.length, acted, failed, ms: Date.now() - started };
}

// ---------- user actions on signals ----------

/** CONFIRM mode: send a waiting signal as a real order (re-checked now). */
export async function confirmSignal(userId: string, id: string, index: number) {
  const d = await prisma.liveDeployment.findFirst({ where: { id, userId } });
  if (!d) throw new LiveCheckError("Deployment not found.");
  const pending = (d.pendingSignals as unknown as PendingSignal[]) ?? [];
  const sig = pending[index];
  if (!sig) throw new LiveCheckError("That signal is no longer waiting.");
  const real = await reconcile(d);
  const quantity = sig.purpose === "exit" ? (sig.targetLevel ? Math.min(sig.quantity, real.qty) : real.qty) : sig.quantity;
  if (quantity <= 0) throw new LiveCheckError("There's no open position to close.");
  pending.splice(index, 1);
  await prisma.liveDeployment.update({ where: { id }, data: { pendingSignals: pending as unknown as Prisma.InputJsonValue } });
  return send(d, { ...sig, quantity });
}

export async function dismissSignal(userId: string, id: string, index: number) {
  const d = await prisma.liveDeployment.findFirst({ where: { id, userId } });
  if (!d) throw new LiveCheckError("Deployment not found.");
  const all = (d.pendingSignals as unknown as PendingSignal[]) ?? [];
  const sig = all[index];
  const pending = all.filter((_, i) => i !== index);
  // Skipping an entry: the strategy stays flat, as the account is.
  const real = sig?.purpose === "strategy" ? await reconcile(d) : null;
  const engineState = real && real.qty === 0 ? (flatten(d.engineState as unknown as PaperSessionState) as unknown as Prisma.InputJsonValue) : undefined;
  await prisma.liveDeployment.update({ where: { id }, data: { pendingSignals: pending as unknown as Prisma.InputJsonValue, ...(engineState ? { engineState } : {}) } });
}

/** Close this deployment's open position now with a market order. */
export async function exitNow(userId: string, id: string) {
  const d = await prisma.liveDeployment.findFirst({ where: { id, userId } });
  if (!d) throw new LiveCheckError("Deployment not found.");
  const real = await reconcile(d);
  if (real.qty <= 0) throw new LiveCheckError("There's no open position to close.");
  const closeSide = (d.engineState as unknown as PaperSessionState).direction === "SHORT" ? "BUY" : "SELL";
  await lg(d, "INFO", `You asked to close the position now: sending ${closeSide} ${real.qty} ${stock(d)}.`);
  return send(d, { side: closeSide, quantity: real.qty, purpose: "exit", reason: "closed by you" });
}
