import { capitalProblem, fitToOrderLimit, INTRADAY_BUYING_POWER } from "@/lib/live/capital";
import "server-only";
import type { LiveDeployment, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logError, logWarn } from "@/lib/logger";
import { BrokerError } from "@/lib/brokers/adapters";
import { brokerById } from "@/lib/brokers/catalog";
import { LIVE_BROKERS } from "@/lib/brokers/live-brokers";
import { marketDataFor, type CandleInterval } from "@/lib/market-data";
import { closedCandles, syncPaperSession, type NewPaperOrder, type PaperSessionState } from "@/lib/paper/sync";
import { inMarketWindow } from "@/lib/paper/market-window";
import { rangeFor } from "@/lib/strategy/session";
import type { ConditionNode } from "@/lib/strategy";
import { LIVE_DEFAULTS, LiveCheckError, placeLiveOrder, refreshLiveOrder } from "./orders";

// Live deployments: a strategy trading on the user's own broker. The forward-
// testing engine decides (same rules, same risk exits, same square-off); every
// buy or sell it makes becomes a real market order — sent at once (AUTO) or
// after the user's tap (CONFIRM). Orders still pass every live-order check
// (caps, kill switch, market hours, symbol read-back). The real position is
// tracked from the broker's fills, and a rejected order pauses the deployment.

export type PendingSignal = { side: "BUY" | "SELL"; quantity: number; reason: string; signalTime: number; createdAt: string; purpose: "strategy" | "exit" };
const READY_WITHIN_MS = 24 * 3_600_000;
const FINAL = new Set(["FILLED", "CANCELLED", "REJECTED", "FAILED"]);

const REASON: Record<string, string> = {
  entry_rule: "entry rule",
  pyramid: "adding to the position",
  exit_rule: "exit rule",
  stop_loss: "stop-loss",
  target: "target",
  trailing_stop: "trailing stop",
  square_off: "intraday square-off",
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
  const market = marketDataFor(userId, "trading");
  const candles = closedCandles(await market.getHistoricalCandles(s.instrument.symbol, rangeFor(s.timeframe, "1mo", market.depth), tf), tf);
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
  await notify(userId, `“${s.name}” is live on ${name} (${input.mode === "AUTO" ? "orders go out automatically" : "each signal waits for your confirmation"}).`);
  return d;
}

/** The engine's position must match the broker's: when nothing is really held, the engine is flat too. */
function flatten(state: PaperSessionState): PaperSessionState {
  return { ...state, positionEntryTime: null, positionEntryPrice: null, positionQuantity: null, positionFavorableExtreme: null, positionStopLossPrice: null, positionTargetPrice: null } as PaperSessionState;
}

export async function setDeploymentStatus(userId: string, id: string, status: "ACTIVE" | "PAUSED" | "STOPPED") {
  const d = await prisma.liveDeployment.findFirst({ where: { id, userId } });
  if (!d) throw new LiveCheckError("Deployment not found.");
  if (d.status === "STOPPED") throw new LiveCheckError("This deployment is stopped — start it again from the strategy.");
  // Resuming after a rejected order: line the engine up with what's really held.
  const real = status === "ACTIVE" ? await reconcile(d) : null;
  const engineState = real && real.qty === 0 && !real.working ? (flatten(d.engineState as unknown as PaperSessionState) as unknown as Prisma.InputJsonValue) : undefined;
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
    if (FINAL.has(o.status) || !o.brokerOrderId) continue;
    try {
      const fresh = await refreshLiveOrder(o.id, d.userId);
      Object.assign(o, fresh);
      if (!FINAL.has(fresh.status)) working = true;
    } catch {
      working = true;
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

async function send(d: LiveDeployment, o: { side: "BUY" | "SELL"; quantity: number; purpose: "strategy" | "exit"; reason: string }) {
  const order = await placeLiveOrder({
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
  if (order.status === "REJECTED" || order.status === "FAILED") {
    await prisma.liveDeployment.update({ where: { id: d.id }, data: { status: "PAUSED", lastError: `${o.side} ${o.quantity} was not accepted: ${order.rejectReason ?? order.status}` } });
    await notify(d.userId, `“${d.strategyName}” paused — the broker didn't accept a ${o.side} order: ${order.rejectReason ?? order.status}.`, "RISK_EVENT");
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
  const market = marketDataFor(d.userId, "trading");
  let result;
  try {
    // Same engine as forward testing; the forming candle is included so a signal on the last closed candle is sent right away.
    result = await syncPaperSession(state, !risk?.killSwitchEnabled, market, { includeForming: true });
  } catch (err) {
    logError("live.deployment.sync", err, { id });
    await prisma.liveDeployment.update({ where: { id }, data: { lastCheckedAt: new Date(), lastError: "Couldn't read prices this time — will retry." } });
    return "idle";
  }

  const pending = (d.pendingSignals as unknown as PendingSignal[]) ?? [];
  let acted = false;
  for (const o of result.newOrders as NewPaperOrder[]) {
    const opening = o.reason === "entry_rule" || o.reason === "pyramid";
    // Exits close what's really held; nothing to close = nothing to send.
    let quantity = opening ? o.quantity : real.qty;
    if (quantity <= 0) continue;
    if (opening && (real.qty > 0 || real.working)) continue; // one position at a time
    let note = "";
    if (opening) {
      // The user's per-order limit still applies: shrink an over-limit order instead of having it refused (which would pause the strategy).
      const fit = fitToOrderLimit(quantity, o.price, maxOrderValue);
      if (fit.quantity < 1) {
        await prisma.liveDeployment.update({ where: { id }, data: { status: "PAUSED", lastError: `One share costs about ₹${Math.round(o.price).toLocaleString("en-IN")}, above your ₹${maxOrderValue.toLocaleString("en-IN")} per-order limit — raise it in Risk Controls.` } });
        await notify(d.userId, `“${d.strategyName}” paused — one share is above your per-order limit (Risk Controls).`, "RISK_EVENT");
        return "paused";
      }
      if (fit.reduced) note = ` (reduced from ${quantity} to ${fit.quantity} shares to fit your ₹${maxOrderValue.toLocaleString("en-IN")} per-order limit)`;
      quantity = fit.quantity;
    }
    const sig: PendingSignal = { side: o.side, quantity, reason: reasonText(o.reason) + note, signalTime: o.signalTime, createdAt: new Date().toISOString(), purpose: opening ? "strategy" : "exit" };
    if (d.mode === "AUTO") {
      try {
        await send(d, sig);
        acted = true;
      } catch (err) {
        const why = err instanceof LiveCheckError ? err.message : err instanceof BrokerError ? (err.failure.detail ?? err.failure.code) : "unexpected error";
        if (!(err instanceof LiveCheckError) && !(err instanceof BrokerError)) logError("live.deployment.send", err, { id });
        await prisma.liveDeployment.update({ where: { id }, data: { status: "PAUSED", lastError: `${sig.side} ${sig.quantity} not sent: ${why}` } });
        await notify(d.userId, `“${d.strategyName}” paused — a ${sig.side} order couldn't be sent: ${why}`, "RISK_EVENT");
        break;
      }
    } else {
      pending.push(sig);
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
  const quantity = sig.purpose === "exit" ? real.qty : sig.quantity;
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
  return send(d, { side: closeSide, quantity: real.qty, purpose: "exit", reason: "closed by you" });
}
