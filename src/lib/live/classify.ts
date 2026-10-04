import { plainSymbol } from "@/lib/brokers/live-brokers";

// Who placed an order or opened a position? From evidence only — never a guess.
//  - An order is MAA when its broker order id is one we sent (every order MyAlgoAgent sends is recorded).
//  - It is UNKNOWN when we hold an order that never got a broker id (the answer was lost) that could be it:
//    same stock, side and quantity.
//  - Otherwise it is MANUAL: we keep a complete record of what we sent, and this isn't in it — so it was placed
//    at the broker directly (or by another tool).
// A position is MAA when our own filled orders explain all of it, MANUAL when none of them touch it,
// MIXED when ours explain only part, and UNKNOWN when an unconfirmed order of ours might be part of it.

export type Source = "MAA" | "MANUAL" | "MIXED" | "UNKNOWN";

export type OurOrder = {
  brokerOrderId: string | null;
  tradingSymbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  filledQuantity: number;
  status: string;
  createdAt: Date;
  strategyName?: string | null;
};
export type BrokerOrder = { id: string; symbol: string; side: string; quantity: number };
export type BrokerPosition = { symbol: string; product: string | null; quantity: number };

const sym = (s: string) => plainSymbol(s) ?? s.toUpperCase();
const UNCONFIRMED = new Set(["CREATED", "OPEN", "TRIGGER_PENDING"]);

export function classifyOrder(o: BrokerOrder, ours: OurOrder[]): { source: Exclude<Source, "MIXED">; strategyName?: string | null } {
  const hit = o.id ? ours.find((x) => x.brokerOrderId === o.id) : undefined;
  if (hit) return { source: "MAA", strategyName: hit.strategyName ?? null };
  const side = o.side.toUpperCase();
  const couldBeOurs = ours.some((x) => !x.brokerOrderId && UNCONFIRMED.has(x.status) && sym(x.tradingSymbol) === sym(o.symbol) && x.side === side && x.quantity === o.quantity);
  return { source: couldBeOurs ? "UNKNOWN" : "MANUAL" };
}

const istDay = (d: Date) => new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 10);

export function classifyPosition(p: BrokerPosition, ours: OurOrder[], now: Date): Source {
  const intraday = /^(MIS|INTRADAY|I)$/i.test(p.product ?? "");
  const mine = ours.filter((x) => sym(x.tradingSymbol) === sym(p.symbol) && (!intraday || istDay(x.createdAt) === istDay(now)));
  if (mine.some((x) => !x.brokerOrderId && UNCONFIRMED.has(x.status))) return "UNKNOWN";
  const net = mine.reduce((n, x) => n + (x.side === "BUY" ? x.filledQuantity : -x.filledQuantity), 0);
  if (net === 0) return "MANUAL";
  const brokerAbs = Math.abs(p.quantity);
  return Math.abs(net) === brokerAbs ? "MAA" : "MIXED";
}
