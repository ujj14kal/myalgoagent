import "server-only";
import { randomBytes } from "node:crypto";
import type { LiveOrder, LiveOrderSide, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logError, logWarn } from "@/lib/logger";
import { BrokerError } from "@/lib/brokers/adapters";
import { accessTokenOf } from "@/lib/brokers/service";
import { egressEnabled } from "@/lib/brokers/egress";
import { cancelGrowwOrder, growwOrderState, growwSymbolOf, placeGrowwOrder } from "@/lib/brokers/groww-orders";
import { marketDataFor } from "@/lib/market-data";

// Real orders. Every order is recorded before it is sent (so nothing reaches a
// broker without a record), carries our own reference as an idempotency key,
// and passes the checks below first. Each step is written to LiveOrderEvent.
// Groww only for now.

export const LIVE_BROKERS = ["groww"] as const;
export const LIVE_DEFAULTS = { maxOrderValue: 25_000, maxOrdersPerDay: 20 };
const DUPLICATE_WINDOW_MS = 60_000;

export class LiveCheckError extends Error {}

export type PlaceInput = {
  userId: string;
  broker: "groww";
  instrumentSymbol: string;
  side: LiveOrderSide;
  quantity: number;
  orderType: "MARKET" | "LIMIT" | "SL" | "SL_M";
  product: "CNC" | "MIS";
  price?: number;
  triggerPrice?: number;
  purpose: "test" | "entry" | "exit" | "manual";
  reason?: string;
};

const IST_MS = 330 * 60_000;
/** NSE cash market: Mon–Fri 09:15–15:30 IST (exchange holidays are the broker's to reject). */
export function marketOpen(now = new Date()): boolean {
  const ist = new Date(now.getTime() + IST_MS);
  const day = ist.getUTCDay();
  const m = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return day >= 1 && day <= 5 && m >= 9 * 60 + 15 && m < 15 * 60 + 30;
}
function istDayStart(now = new Date()): Date {
  const ist = new Date(now.getTime() + IST_MS);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - IST_MS);
}
export const newReference = () => `MAA-${randomBytes(8).toString("base64url").replace(/[^A-Za-z0-9]/g, "").slice(0, 10).padEnd(10, "0")}`;
/** NSE tick size for most stocks is ₹0.05. */
export const toTick = (p: number, dir: "down" | "up" = "down") => (dir === "down" ? Math.floor(p * 20) / 20 : Math.ceil(p * 20) / 20);

async function event(orderId: string, kind: string, detail?: Prisma.InputJsonValue) {
  await prisma.liveOrderEvent.create({ data: { orderId, kind, detail } }).catch((err) => logError("live.event", err, { orderId, kind }));
}

/** The broker session to trade with, or a plain reason why not. */
async function session(userId: string, broker: string) {
  const conn = await prisma.brokerConnection.findUnique({ where: { userId_broker: { userId, broker } } });
  const token = conn && conn.status === "CONNECTED" && conn.tokenExpiresAt && conn.tokenExpiresAt > new Date() ? accessTokenOf(conn) : null;
  if (!token) throw new LiveCheckError("Connect Groww for today first (Broker Connections → Connect for today).");
  return token;
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
  if (!(LIVE_BROKERS as readonly string[]).includes(input.broker)) throw new LiveCheckError("Live orders are available for Groww only right now.");
  if (!egressEnabled()) throw new LiveCheckError("The static-IP relay isn't configured, so the broker would reject the order.");
  if (!marketOpen()) throw new LiveCheckError("The market is closed (NSE: Mon–Fri, 09:15–15:30 IST).");
  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 100_000) throw new LiveCheckError("Quantity must be a whole number of shares.");
  const sym = growwSymbolOf(input.instrumentSymbol);
  if (!sym) throw new LiveCheckError(`${input.instrumentSymbol} can't be traded on Groww.`);
  if ((input.orderType === "LIMIT" || input.orderType === "SL") && !(input.price && input.price > 0)) throw new LiveCheckError("A limit price is required.");

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
  return { email: user.email, sym };
}

/** Record, check and send a real order. Returns the stored order (FAILED/REJECTED ones included). */
export async function placeLiveOrder(input: PlaceInput): Promise<LiveOrder> {
  const { email, sym } = await preflight(input);
  const token = await session(input.userId, input.broker);
  const order = await prisma.liveOrder.create({
    data: {
      userId: input.userId,
      userEmail: email,
      broker: input.broker,
      clientRef: newReference(),
      exchange: sym.exchange,
      tradingSymbol: sym.tradingSymbol,
      instrumentSymbol: input.instrumentSymbol,
      side: input.side,
      orderType: input.orderType,
      product: input.product,
      quantity: input.quantity,
      price: input.price ?? null,
      triggerPrice: input.triggerPrice ?? null,
      purpose: input.purpose,
      reason: input.reason ?? null,
    },
  });
  await event(order.id, "created", { side: input.side, quantity: input.quantity, orderType: input.orderType, price: input.price ?? null, purpose: input.purpose });
  try {
    const r = await placeGrowwOrder(token, {
      tradingSymbol: sym.tradingSymbol,
      exchange: sym.exchange,
      segment: "CASH",
      product: input.product,
      orderType: input.orderType,
      side: input.side,
      quantity: input.quantity,
      price: input.price,
      triggerPrice: input.triggerPrice,
      reference: order.clientRef,
    });
    await event(order.id, "submitted", { brokerOrderId: r.brokerOrderId, brokerStatus: r.brokerStatus, remark: r.remark });
    return prisma.liveOrder.update({ where: { id: order.id }, data: { brokerOrderId: r.brokerOrderId, brokerStatus: r.brokerStatus, status: "OPEN", submittedAt: new Date() } });
  } catch (err) {
    const f = err instanceof BrokerError ? err.failure : { code: "unknown" as const, detail: err instanceof Error ? err.message : undefined };
    await event(order.id, "error", { code: f.code, detail: f.detail ?? null });
    if (!(err instanceof BrokerError)) logError("live.place", err, { orderId: order.id });
    else logWarn("live.place", f.code, { orderId: order.id, detail: f.detail });
    // No answer from Groww: the order may exist. Keep it open for reconciliation by our reference.
    if (f.code === "unreachable") return prisma.liveOrder.update({ where: { id: order.id }, data: { rejectReason: "No answer from Groww yet — checking by reference." } });
    return prisma.liveOrder.update({ where: { id: order.id }, data: { status: f.code === "session_rejected" ? "FAILED" : "REJECTED", rejectReason: f.detail ?? f.code, closedAt: new Date() } });
  }
}

const FINAL = new Set(["FILLED", "CANCELLED", "REJECTED", "FAILED"]);

/** Ask Groww for an order's latest state and store any change. */
export async function refreshLiveOrder(orderId: string, userId: string): Promise<LiveOrder> {
  const order = await prisma.liveOrder.findFirst({ where: { id: orderId, userId } });
  if (!order) throw new LiveCheckError("Order not found.");
  if (FINAL.has(order.status)) return order;
  const token = await session(userId, order.broker);
  const s = await growwOrderState(token, { brokerOrderId: order.brokerOrderId, reference: order.clientRef, quantity: order.quantity, segment: order.segment });
  if (s.brokerStatus === order.brokerStatus && s.filledQuantity === order.filledQuantity && order.brokerOrderId) return order;
  await event(order.id, "status", { brokerStatus: s.brokerStatus, filled: s.filledQuantity, averagePrice: s.averagePrice, remark: s.remark });
  return prisma.liveOrder.update({
    where: { id: order.id },
    data: {
      brokerOrderId: s.brokerOrderId || order.brokerOrderId,
      brokerStatus: s.brokerStatus,
      status: s.status,
      filledQuantity: s.filledQuantity,
      averagePrice: s.averagePrice,
      rejectReason: s.status === "REJECTED" || s.status === "FAILED" ? (s.remark ?? order.rejectReason) : order.rejectReason === "No answer from Groww yet — checking by reference." ? null : order.rejectReason,
      closedAt: FINAL.has(s.status) ? new Date() : null,
    },
  });
}

export async function cancelLiveOrder(orderId: string, userId: string): Promise<LiveOrder> {
  const order = await prisma.liveOrder.findFirst({ where: { id: orderId, userId } });
  if (!order) throw new LiveCheckError("Order not found.");
  if (FINAL.has(order.status)) throw new LiveCheckError("That order is already finished.");
  if (!order.brokerOrderId) throw new LiveCheckError("Groww hasn't confirmed this order yet — refresh first.");
  const token = await session(userId, order.broker);
  const brokerStatus = await cancelGrowwOrder(token, order.brokerOrderId, order.segment);
  await event(order.id, "cancel_requested", { brokerStatus });
  return refreshLiveOrder(order.id, userId);
}

/**
 * End-to-end check without trading: a 1-share limit BUY about 8% below the
 * last price (inside the exchange's price band, so it rests instead of being
 * rejected, but far enough away not to fill), then cancel it.
 */
export async function connectivityTest(userId: string, instrumentSymbol: string) {
  const steps: { step: string; ok: boolean; detail?: string }[] = [];
  const last = await lastPrice(userId, instrumentSymbol);
  const price = toTick(last * 0.92);
  steps.push({ step: `Last price ₹${last.toFixed(2)} → test limit buy 1 share at ₹${price.toFixed(2)}`, ok: true });
  let order = await placeLiveOrder({ userId, broker: "groww", instrumentSymbol, side: "BUY", quantity: 1, orderType: "LIMIT", product: "CNC", price, purpose: "test", reason: "Connectivity test (placed far from the market, then cancelled)" });
  if (order.status !== "OPEN") {
    steps.push({ step: "Place the order through the static IP", ok: false, detail: order.rejectReason ?? order.status });
    return { order, steps };
  }
  steps.push({ step: "Groww accepted the order from the static IP", ok: true, detail: `Order ${order.brokerOrderId}` });
  await new Promise((r) => setTimeout(r, 1500));
  order = await refreshLiveOrder(order.id, userId);
  steps.push({ step: "Read the order back", ok: true, detail: order.brokerStatus ?? order.status });
  if (order.status === "OPEN" || order.status === "TRIGGER_PENDING") {
    order = await cancelLiveOrder(order.id, userId);
    await new Promise((r) => setTimeout(r, 1500));
    order = await refreshLiveOrder(order.id, userId);
    steps.push({ step: "Cancel it", ok: order.status === "CANCELLED", detail: order.brokerStatus ?? order.status });
  } else {
    steps.push({ step: "Cancel it", ok: false, detail: `Order is ${order.status.toLowerCase()} — check it on Groww.` });
  }
  return { order, steps };
}
