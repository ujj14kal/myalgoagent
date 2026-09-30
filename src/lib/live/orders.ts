import "server-only";
import { randomBytes } from "node:crypto";
import type { LiveOrder, LiveOrderSide, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logError, logWarn } from "@/lib/logger";
import { BrokerError } from "@/lib/brokers/adapters";
import { accessTokenOf, credsOf } from "@/lib/brokers/service";
import { egressEnabled } from "@/lib/brokers/egress";
import { brokerById } from "@/lib/brokers/catalog";
import { angelLtp, LIVE_BROKERS, LIVE_NOT_YET, sameInstrument, type LiveBroker, type LiveCtx, type Segment } from "@/lib/brokers/live-brokers";
import { onTick } from "@/lib/brokers/nse-master";
import { nseEquity } from "@/lib/brokers/nse-lookup";
import { marketDataFor } from "@/lib/market-data";

// Real orders, for every broker with a live adapter. Every order is recorded
// before it is sent (nothing reaches a broker without a record), carries our
// own reference as an idempotency key, passes the checks below, and is
// resolved to the exchange's own identifiers via the NSE master. Every status
// refresh reads the order back from the broker and checks it is for the stock
// we meant — a mismatch cancels it and blocks that broker for the account.

export const LIVE_DEFAULTS = { maxOrderValue: 25_000, maxOrdersPerDay: 20 };
const DUPLICATE_WINDOW_MS = 60_000;
const MISMATCH = "symbol_mismatch";

export class LiveCheckError extends Error {}

export type PlaceInput = {
  userId: string;
  broker: string;
  instrumentSymbol: string;
  side: LiveOrderSide;
  quantity: number;
  orderType: "MARKET" | "LIMIT" | "SL" | "SL_M";
  product: "CNC" | "MIS";
  price?: number;
  triggerPrice?: number;
  purpose: "entry" | "exit" | "manual" | "strategy";
  reason?: string;
  /** Set when a live deployment places the order. */
  deploymentId?: string;
};

const IST_MS = 330 * 60_000;
/** NSE cash market: Mon–Fri 09:15–15:30 IST (exchange holidays are the broker's to reject). */
export function marketOpen(now = new Date()): boolean {
  const ist = new Date(now.getTime() + IST_MS);
  const day = ist.getUTCDay();
  const m = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return day >= 1 && day <= 5 && m >= 9 * 60 + 15 && m < 15 * 60 + 30;
}
export function istDayStart(now = new Date()): Date {
  const ist = new Date(now.getTime() + IST_MS);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - IST_MS);
}
/** Letters and digits only (every broker's tag rules allow it): "MAA" + 11 characters. */
export const newReference = () => `MAA${randomBytes(12).toString("base64url").replace(/[^A-Za-z0-9]/g, "").slice(0, 11).padEnd(11, "0")}`;

export function liveBroker(id: string): LiveBroker {
  const b = LIVE_BROKERS[id as keyof typeof LIVE_BROKERS];
  if (!b) throw new LiveCheckError(LIVE_NOT_YET[id as keyof typeof LIVE_NOT_YET] ?? `Live orders aren't available for ${brokerById(id)?.name ?? id} yet.`);
  return b;
}

export async function event(orderId: string, kind: string, detail?: Prisma.InputJsonValue) {
  await prisma.liveOrderEvent.create({ data: { orderId, kind, detail } }).catch((err) => logError("live.event", err, { orderId, kind }));
}

/** The broker session to trade with, or a plain reason why not. */
export async function session(userId: string, broker: string): Promise<LiveCtx> {
  const conn = await prisma.brokerConnection.findUnique({ where: { userId_broker: { userId, broker } } });
  const token = conn && conn.status === "CONNECTED" && conn.tokenExpiresAt && conn.tokenExpiresAt > new Date() ? accessTokenOf(conn) : null;
  const name = brokerById(broker)?.name ?? broker;
  if (!conn || !token) throw new LiveCheckError(`Connect ${name} for today first (Broker Connections).`);
  return { creds: credsOf(conn), token };
}

/** Our NSE symbol ("RELIANCE.NS") resolved to the exchange's identifiers. */
async function resolve(instrumentSymbol: string) {
  const m = /^([A-Z0-9&-]+)\.NS$/.exec(instrumentSymbol.toUpperCase());
  if (!m) throw new LiveCheckError(`${instrumentSymbol} isn't an NSE stock — live orders are NSE equity only for now.`);
  const eq = await nseEquity(m[1]);
  if (!eq) throw new LiveCheckError(`${m[1]} isn't in NSE's current equity list.`);
  return eq;
}

export async function lastPrice(userId: string, instrumentSymbol: string): Promise<number> {
  const candles = await marketDataFor(userId, "trading").getHistoricalCandles(instrumentSymbol, "5d", "1d");
  const close = candles.at(-1)?.close;
  if (!close) throw new LiveCheckError(`No recent price for ${instrumentSymbol}.`);
  return close;
}

/** Every check a real order must pass. Exits are never blocked by the kill switch or the caps. */
async function preflight(input: PlaceInput) {
  const user = await prisma.user.findUnique({ where: { id: input.userId }, select: { email: true, status: true, liveTradingEnabledAt: true, riskSettings: true } });
  if (!user || user.status !== "ACTIVE") throw new LiveCheckError("This account can't trade.");
  if (!user.liveTradingEnabledAt) throw new LiveCheckError("Live trading isn't switched on for this account.");
  const broker = liveBroker(input.broker);
  if (!egressEnabled()) throw new LiveCheckError("The static-IP relay isn't configured, so the broker would reject the order.");
  if (!marketOpen()) throw new LiveCheckError("The market is closed (NSE: Mon–Fri, 09:15–15:30 IST).");
  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 100_000) throw new LiveCheckError("Quantity must be a whole number of shares.");
  if ((input.orderType === "LIMIT" || input.orderType === "SL") && !(input.price && input.price > 0)) throw new LiveCheckError("A limit price is required.");
  if ((input.orderType === "SL" || input.orderType === "SL_M") && !(input.triggerPrice && input.triggerPrice > 0)) throw new LiveCheckError("A trigger price is required.");

  const blocked = await prisma.liveOrderEvent.findFirst({ where: { kind: MISMATCH, order: { userId: input.userId, broker: input.broker }, at: { gte: new Date(Date.now() - 30 * 86_400_000) } } });
  if (blocked) throw new LiveCheckError("Live orders on this broker are paused for your account: it reported an order for a different stock than we sent. Contact support before trading here again.");

  const eq = await resolve(input.instrumentSymbol);
  const exit = input.purpose === "exit";
  const risk = user.riskSettings;
  if (!exit) {
    if (risk?.killSwitchEnabled && input.side === "BUY") throw new LiveCheckError("The kill switch is on — new positions are blocked. Turn it off in Risk Controls first.");
    const ref = input.price ?? (await lastPrice(input.userId, input.instrumentSymbol));
    const value = ref * input.quantity;
    const maxValue = risk?.liveMaxOrderValue ?? LIVE_DEFAULTS.maxOrderValue;
    if (value > maxValue) throw new LiveCheckError(`That order is about ₹${Math.round(value).toLocaleString("en-IN")}, above your ₹${maxValue.toLocaleString("en-IN")} per-order limit (Risk Controls).`);
    const today = await prisma.liveOrder.count({ where: { userId: input.userId, createdAt: { gte: istDayStart() }, status: { not: "FAILED" } } });
    const maxOrders = risk?.liveMaxOrdersPerDay ?? LIVE_DEFAULTS.maxOrdersPerDay;
    if (today >= maxOrders) throw new LiveCheckError(`You've reached your limit of ${maxOrders} live orders today (Risk Controls).`);
  }
  const dup = await prisma.liveOrder.findFirst({
    where: {
      userId: input.userId,
      instrumentSymbol: input.instrumentSymbol,
      side: input.side,
      purpose: input.purpose,
      status: { in: ["CREATED", "OPEN", "TRIGGER_PENDING"] },
      createdAt: { gte: new Date(Date.now() - DUPLICATE_WINDOW_MS) },
    },
  });
  if (dup) throw new LiveCheckError("An identical order was sent less than a minute ago and is still working — not sending a duplicate.");
  return { email: user.email, broker, eq };
}

/** Record, check and send a real order. Returns the stored order (FAILED/REJECTED ones included). */
export async function placeLiveOrder(input: PlaceInput): Promise<LiveOrder> {
  const { email, broker, eq } = await preflight(input);
  const ctx = await session(input.userId, input.broker);

  // Prices on the stock's tick; a market order where the broker forbids them becomes a protected limit.
  let orderType = input.orderType;
  let price = input.price !== undefined ? onTick(input.price, eq.tick) : undefined;
  const triggerPrice = input.triggerPrice !== undefined ? onTick(input.triggerPrice, eq.tick) : undefined;
  let note = input.reason ?? null;
  if (orderType === "MARKET" && !broker.marketOrders) {
    const ltp = input.broker === "angelone" ? await angelLtp(ctx, { tradingSymbol: eq.symbol, series: eq.series, nseToken: eq.token }) : await lastPrice(input.userId, input.instrumentSymbol);
    price = input.side === "BUY" ? onTick(ltp * 1.01, eq.tick, "up") : onTick(ltp * 0.99, eq.tick, "down");
    orderType = "LIMIT";
    note = `${note ? `${note} · ` : ""}Sent as a limit at ₹${price} (1% from ₹${ltp}) — this broker doesn't accept market orders from algos.`;
  }

  const order = await prisma.liveOrder.create({
    data: {
      userId: input.userId,
      userEmail: email,
      broker: input.broker,
      clientRef: newReference(),
      exchange: "NSE",
      tradingSymbol: eq.symbol,
      instrumentSymbol: input.instrumentSymbol,
      side: input.side,
      orderType,
      product: input.product,
      quantity: input.quantity,
      price: price ?? null,
      triggerPrice: triggerPrice ?? null,
      purpose: input.purpose,
      reason: note,
      deploymentId: input.deploymentId ?? null,
    },
  });
  await event(order.id, "created", { side: input.side, quantity: input.quantity, orderType, price: price ?? null, triggerPrice: triggerPrice ?? null, purpose: input.purpose, nseToken: eq.token, tick: eq.tick });
  try {
    const r = await broker.place(ctx, {
      tradingSymbol: eq.symbol,
      series: eq.series,
      nseToken: eq.token,
      isin: eq.isin,
      tick: eq.tick,
      side: input.side,
      quantity: input.quantity,
      orderType,
      product: input.product,
      price,
      triggerPrice,
      reference: order.clientRef,
    });
    await event(order.id, "submitted", { brokerOrderId: r.brokerOrderId, brokerStatus: r.brokerStatus, remark: r.remark });
    return prisma.liveOrder.update({ where: { id: order.id }, data: { brokerOrderId: r.brokerOrderId, brokerStatus: r.brokerStatus, status: "OPEN", submittedAt: new Date() } });
  } catch (err) {
    const f = err instanceof BrokerError ? err.failure : { code: "unknown" as const, detail: err instanceof Error ? err.message : undefined };
    await event(order.id, "error", { code: f.code, detail: f.detail ?? null });
    if (!(err instanceof BrokerError)) logError("live.place", err, { orderId: order.id, broker: input.broker });
    else logWarn("live.place", f.code, { orderId: order.id, broker: input.broker, detail: f.detail });
    // No answer: the order may exist at the broker. Keep it open and confirm it by our reference.
    if (f.code === "unreachable") return prisma.liveOrder.update({ where: { id: order.id }, data: { rejectReason: "No answer from the broker yet — checking by reference." } });
    return prisma.liveOrder.update({ where: { id: order.id }, data: { status: f.code === "session_rejected" ? "FAILED" : "REJECTED", rejectReason: f.detail ?? f.code, closedAt: new Date() } });
  }
}

const FINAL = new Set(["FILLED", "CANCELLED", "REJECTED", "FAILED"]);
/** F&O orders are stored with exchange "NFO". */
export const segmentOf = (o: { exchange: string }): Segment => (o.exchange === "NFO" ? "FO" : "EQ");

/** Ask the broker for an order's latest state, check it's the stock we sent, and store any change. */
export async function refreshLiveOrder(orderId: string, userId: string): Promise<LiveOrder> {
  const order = await prisma.liveOrder.findFirst({ where: { id: orderId, userId } });
  if (!order) throw new LiveCheckError("Order not found.");
  if (FINAL.has(order.status)) return order;
  const broker = liveBroker(order.broker);
  const ctx = await session(userId, order.broker);
  const s = await broker.state(ctx, { brokerOrderId: order.brokerOrderId, reference: order.clientRef, quantity: order.quantity, segment: segmentOf(order) });

  if (s.symbol && !sameInstrument(order, s.symbol)) {
    // The broker placed something other than what we sent: stop it and stop trading there.
    await event(order.id, MISMATCH, { expected: order.tradingSymbol, broker: s.symbol, brokerOrderId: s.brokerOrderId });
    logError("live.symbol-mismatch", new Error(`Broker reported ${s.symbol} for ${order.tradingSymbol}`), { orderId: order.id, broker: order.broker });
    if (!FINAL.has(s.status) && s.brokerOrderId) await broker.cancel(ctx, s.brokerOrderId, segmentOf(order)).catch(() => {});
    return prisma.liveOrder.update({
      where: { id: order.id },
      data: { brokerOrderId: s.brokerOrderId || order.brokerOrderId, brokerStatus: s.brokerStatus, status: FINAL.has(s.status) ? s.status : "OPEN", filledQuantity: s.filledQuantity, rejectReason: `The broker reported this order as ${s.symbol}, not ${order.tradingSymbol} — cancelled, and live orders on this broker are paused. Check your broker app.` },
    });
  }

  const changed = s.brokerStatus !== order.brokerStatus || s.filledQuantity !== order.filledQuantity || (!!s.brokerOrderId && s.brokerOrderId !== order.brokerOrderId);
  if (!changed) return order;
  await event(order.id, "status", { brokerStatus: s.brokerStatus, filled: s.filledQuantity, averagePrice: s.averagePrice, remark: s.remark, symbol: s.symbol });
  return prisma.liveOrder.update({
    where: { id: order.id },
    data: {
      brokerOrderId: s.brokerOrderId || order.brokerOrderId,
      brokerStatus: s.brokerStatus,
      status: s.status,
      filledQuantity: s.filledQuantity,
      averagePrice: s.averagePrice,
      rejectReason: s.status === "REJECTED" || s.status === "FAILED" ? (s.remark ?? order.rejectReason) : order.rejectReason?.startsWith("No answer from the broker") ? null : order.rejectReason,
      closedAt: FINAL.has(s.status) ? new Date() : null,
    },
  });
}

export async function cancelLiveOrder(orderId: string, userId: string): Promise<LiveOrder> {
  const order = await prisma.liveOrder.findFirst({ where: { id: orderId, userId } });
  if (!order) throw new LiveCheckError("Order not found.");
  if (FINAL.has(order.status)) throw new LiveCheckError("That order is already finished.");
  if (!order.brokerOrderId) throw new LiveCheckError("The broker hasn't confirmed this order yet — refresh first.");
  const broker = liveBroker(order.broker);
  const ctx = await session(userId, order.broker);
  const brokerStatus = await broker.cancel(ctx, order.brokerOrderId, segmentOf(order));
  await event(order.id, "cancel_requested", { brokerStatus });
  return refreshLiveOrder(order.id, userId);
}
