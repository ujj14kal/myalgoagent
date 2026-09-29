import "server-only";
import type { LiveOrder } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logError, logWarn } from "@/lib/logger";
import { BrokerError } from "@/lib/brokers/adapters";
import { egressEnabled } from "@/lib/brokers/egress";
import { brokerById } from "@/lib/brokers/catalog";
import { foInstrumentLabel, type FoContract } from "@/lib/brokers/live-brokers";
import { growwOption } from "@/lib/brokers/groww-fno";
import { onTick } from "@/lib/brokers/nse-master";
import { marketExtrasFor } from "@/lib/market-data";
import { event, istDayStart, LIVE_DEFAULTS, LiveCheckError, liveBroker, marketOpen, newReference, refreshLiveOrder, cancelLiveOrder, session } from "./orders";

// A user's multi-leg options position, sent as orders on their own broker
// account only after they review the preview and confirm. Buy legs (hedges)
// go first, then sell legs; every leg is a protected LIMIT priced from the
// live chain on the server. If a leg fails, legs still open are cancelled and
// filled ones are reported — nothing is closed automatically.

export type BasketLeg = { type: "CE" | "PE"; side: "BUY" | "SELL"; strike: number; lots: number };
export type BasketInput = { userId: string; broker: string; underlying: string; expiry: string; product: "MIS" | "NRML"; legs: BasketLeg[] };

export type PreviewLeg = BasketLeg & {
  contract: FoContract;
  quantity: number;
  lotSize: number;
  limitPrice: number;
  ltp: number | null;
  bid: number | null;
  ask: number | null;
  /** Premium paid (buy) or received (sell) at the limit price, ₹. */
  value: number;
};
export type BasketPreview = { legs: PreviewLeg[]; premiumPaid: number; premiumReceived: number; brokerName: string };

const PROTECT = 0.01; // limit 1% through the quote: fills like a market order but can't run away

/** Every check a basket must pass, and the exact orders it would send. Prices come from the live chain, never the browser. */
export async function previewBasket(input: BasketInput): Promise<BasketPreview> {
  const user = await prisma.user.findUnique({ where: { id: input.userId }, select: { status: true, liveTradingEnabledAt: true, riskSettings: true } });
  if (!user || user.status !== "ACTIVE") throw new LiveCheckError("This account can't trade.");
  if (!user.liveTradingEnabledAt) throw new LiveCheckError("Live trading isn't switched on for this account.");
  const broker = liveBroker(input.broker);
  const name = brokerById(input.broker)?.name ?? input.broker;
  if (!broker.fno) throw new LiveCheckError(`Options orders through ${name} aren't available yet.`);
  if (broker.fno === "intraday" && input.product !== "MIS") throw new LiveCheckError(`${name} options orders are intraday only for now.`);
  if (!egressEnabled()) throw new LiveCheckError("The static-IP relay isn't configured, so the broker would reject the order.");
  if (!marketOpen()) throw new LiveCheckError("The market is closed (NSE F&O: Mon–Fri, 09:15–15:30 IST).");
  if (user.riskSettings?.killSwitchEnabled) throw new LiveCheckError("The kill switch is on — new positions are blocked. Turn it off in Risk Controls first.");
  if (!input.legs.length || input.legs.length > 6) throw new LiveCheckError("A basket has 1 to 6 legs.");
  if (!/^[A-Z0-9&-]{2,20}$/.test(input.underlying) || !/^\d{4}-\d{2}-\d{2}$/.test(input.expiry)) throw new LiveCheckError("Pick an underlying and expiry.");

  const extras = marketExtrasFor(input.userId);
  if (!extras) throw new LiveCheckError("Options orders need live option prices, which aren't enabled for your account yet.");
  const chain = await extras.optionChain(input.underlying, input.expiry);

  const maxValue = user.riskSettings?.liveMaxOrderValue ?? LIVE_DEFAULTS.maxOrderValue;
  const legs: PreviewLeg[] = [];
  for (const l of input.legs) {
    if (!Number.isInteger(l.lots) || l.lots < 1 || l.lots > 50) throw new LiveCheckError("Lots must be between 1 and 50.");
    const g = await growwOption(input.underlying, input.expiry, l.strike, l.type);
    if (!g) throw new LiveCheckError(`${input.underlying} ${l.strike} ${l.type} (${input.expiry}) isn't a listed contract.`);
    if ((l.side === "BUY" && !g.buyAllowed) || (l.side === "SELL" && !g.sellAllowed)) throw new LiveCheckError(`The exchange isn't allowing ${l.side.toLowerCase()} orders in ${g.tradingSymbol} right now.`);
    const q = chain.find((r) => r.strike === l.strike);
    const quote = q ? (l.type === "CE" ? q.call : q.put) : null;
    const ref = l.side === "BUY" ? (quote?.ask ?? quote?.ltp) : (quote?.bid ?? quote?.ltp);
    if (!ref) throw new LiveCheckError(`No live price for ${g.tradingSymbol} — it may not be trading.`);
    const limitPrice = Math.max(g.tick, l.side === "BUY" ? onTick(ref * (1 + PROTECT), g.tick, "up") : onTick(ref * (1 - PROTECT), g.tick, "down"));
    const quantity = l.lots * g.lotSize;
    if (g.freezeQty && quantity > g.freezeQty) throw new LiveCheckError(`${g.tradingSymbol}: ${quantity} is above the exchange's freeze limit of ${g.freezeQty} per order.`);
    const value = Math.round(quantity * limitPrice * 100) / 100;
    if (value > maxValue) throw new LiveCheckError(`${g.tradingSymbol} is about ₹${Math.round(value).toLocaleString("en-IN")} in premium, above your ₹${maxValue.toLocaleString("en-IN")} per-order limit (Risk Controls).`);
    legs.push({
      ...l,
      contract: { exchangeSymbol: g.tradingSymbol, token: g.exchangeToken, underlying: input.underlying, expiry: input.expiry, strike: l.strike, type: l.type },
      quantity,
      lotSize: g.lotSize,
      limitPrice,
      ltp: quote?.ltp ?? null,
      bid: quote?.bid ?? null,
      ask: quote?.ask ?? null,
      value,
    });
  }
  const today = await prisma.liveOrder.count({ where: { userId: input.userId, createdAt: { gte: istDayStart() }, status: { not: "FAILED" } } });
  const maxOrders = user.riskSettings?.liveMaxOrdersPerDay ?? LIVE_DEFAULTS.maxOrdersPerDay;
  if (today + legs.length > maxOrders) throw new LiveCheckError(`This basket is ${legs.length} orders; you have ${Math.max(0, maxOrders - today)} left of your ${maxOrders} a day (Risk Controls).`);

  // Hedges first: buying before selling keeps the margin needed (and the risk if a later leg fails) lower.
  legs.sort((a, b) => (a.side === b.side ? 0 : a.side === "BUY" ? -1 : 1));
  return {
    legs,
    premiumPaid: legs.filter((l) => l.side === "BUY").reduce((s, l) => s + l.value, 0),
    premiumReceived: legs.filter((l) => l.side === "SELL").reduce((s, l) => s + l.value, 0),
    brokerName: name,
  };
}

export type BasketResult = { orders: LiveOrder[]; failedAt: number | null; message: string };

/** Sends the user's confirmed basket (re-checked and re-priced now). Stops at the first leg that fails and unwinds what's still open. */
export async function placeBasket(input: BasketInput): Promise<BasketResult> {
  const preview = await previewBasket(input);
  const broker = liveBroker(input.broker);
  const ctx = await session(input.userId, input.broker);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: input.userId }, select: { email: true } });
  const basketRef = newReference();
  const orders: LiveOrder[] = [];

  for (let i = 0; i < preview.legs.length; i++) {
    const l = preview.legs[i];
    const order = await prisma.liveOrder.create({
      data: {
        userId: input.userId,
        userEmail: user.email,
        broker: input.broker,
        clientRef: newReference(),
        exchange: "NFO",
        tradingSymbol: l.contract.exchangeSymbol,
        instrumentSymbol: foInstrumentLabel(l.contract),
        side: l.side,
        orderType: "LIMIT",
        product: input.product,
        quantity: l.quantity,
        price: l.limitPrice,
        purpose: "manual",
        reason: `Options basket ${basketRef} · leg ${i + 1} of ${preview.legs.length} · limit 1% through the ${l.side === "BUY" ? "ask" : "bid"}`,
      },
    });
    await event(order.id, "created", { basket: basketRef, leg: i + 1, side: l.side, quantity: l.quantity, price: l.limitPrice, token: l.contract.token, ltp: l.ltp, bid: l.bid, ask: l.ask });
    try {
      const r = await broker.place(ctx, {
        tradingSymbol: l.contract.exchangeSymbol,
        series: "",
        nseToken: l.contract.token,
        isin: "",
        tick: 0.05,
        side: l.side,
        quantity: l.quantity,
        orderType: "LIMIT",
        product: input.product,
        price: l.limitPrice,
        reference: order.clientRef,
        fo: l.contract,
      });
      await event(order.id, "submitted", { brokerOrderId: r.brokerOrderId, brokerStatus: r.brokerStatus, remark: r.remark });
      orders.push(await prisma.liveOrder.update({ where: { id: order.id }, data: { brokerOrderId: r.brokerOrderId, brokerStatus: r.brokerStatus, status: "OPEN", submittedAt: new Date() } }));
    } catch (err) {
      const f = err instanceof BrokerError ? err.failure : { code: "unknown" as const, detail: err instanceof Error ? err.message : undefined };
      await event(order.id, "error", { code: f.code, detail: f.detail ?? null });
      if (!(err instanceof BrokerError)) logError("live.basket", err, { orderId: order.id });
      else logWarn("live.basket", f.code, { orderId: order.id, detail: f.detail });
      // No answer: the order may exist at the broker — keep it open to be confirmed by reference.
      const failed = await prisma.liveOrder.update({
        where: { id: order.id },
        data: f.code === "unreachable" ? { rejectReason: "No answer from the broker yet — checking by reference." } : { status: "REJECTED", rejectReason: f.detail ?? f.code, closedAt: new Date() },
      });
      orders.push(failed);
      return { orders: await unwind(orders, input.userId), failedAt: i, message: `Leg ${i + 1} (${l.contract.exchangeSymbol}) wasn't accepted${f.detail ? `: ${f.detail}` : ""}. Legs still open were cancelled; check any that filled.` };
    }
  }
  return { orders, failedAt: null, message: `All ${orders.length} legs sent to ${preview.brokerName}.` };
}

/** After a failed leg: cancel legs that are still working; leave filled ones for the user to decide. */
async function unwind(orders: LiveOrder[], userId: string): Promise<LiveOrder[]> {
  const out: LiveOrder[] = [];
  for (const o of orders) {
    if (o.status !== "OPEN" || !o.brokerOrderId) {
      out.push(o);
      continue;
    }
    try {
      const fresh = await refreshLiveOrder(o.id, userId);
      out.push(fresh.status === "OPEN" || fresh.status === "TRIGGER_PENDING" ? await cancelLiveOrder(o.id, userId) : fresh);
    } catch (err) {
      if (!(err instanceof LiveCheckError) && !(err instanceof BrokerError)) logError("live.basket.unwind", err, { orderId: o.id });
      out.push(o);
    }
  }
  return out;
}
