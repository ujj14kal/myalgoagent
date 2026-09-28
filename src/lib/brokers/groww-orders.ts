import type { LiveOrderStatus } from "@prisma/client";
import { brokerMessage, BrokerError } from "./adapters";
import { brokerFetch } from "./egress";

// Groww Trade API — orders and positions (https://groww.in/trade-api/docs).
// Every call goes through brokerFetch, i.e. the static-IP relay when it's
// configured; Groww only accepts order calls from the IP registered on the
// client's account.

const BASE = "https://api.groww.in/v1";
const TIMEOUT_MS = 12_000;

export type GrowwOrderInput = {
  tradingSymbol: string;
  exchange: "NSE" | "BSE";
  segment: "CASH";
  product: "CNC" | "MIS";
  orderType: "MARKET" | "LIMIT" | "SL" | "SL_M";
  side: "BUY" | "SELL";
  quantity: number;
  price?: number;
  triggerPrice?: number;
  /** Our reference: 8–20 characters, letters/digits with at most two hyphens. */
  reference: string;
};

export type GrowwOrderState = {
  brokerOrderId: string;
  brokerStatus: string;
  status: LiveOrderStatus;
  filledQuantity: number;
  averagePrice: number | null;
  remark: string | null;
};

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);

async function groww(token: string, method: "GET" | "POST", path: string, body?: Record<string, unknown>) {
  let res: { status: number; text(): Promise<string> };
  try {
    res = await brokerFetch(`${BASE}${path}`, {
      method,
      headers: { Accept: "application/json", "X-API-VERSION": "1.0", Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    throw new BrokerError("unreachable");
  }
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    // gateway error page
  }
  if (res.status === 401 || res.status === 403) throw new BrokerError("session_rejected", brokerMessage(json) ?? `Groww answered ${res.status}`);
  if (res.status >= 500) throw new BrokerError("unreachable", brokerMessage(json));
  if (res.status >= 400 || json.status === "FAILURE") throw new BrokerError("unknown", brokerMessage(json) ?? `Groww answered ${res.status}`);
  return obj(json.payload);
}

/** Groww's order statuses mapped onto our lifecycle. */
export function mapGrowwStatus(s: string, filled: number, quantity: number): LiveOrderStatus {
  switch (s) {
    case "EXECUTED":
    case "COMPLETED":
    case "DELIVERY_AWAITED":
      return filled > 0 && filled < quantity ? "PARTIALLY_FILLED" : "FILLED";
    case "CANCELLED":
      return filled > 0 ? "PARTIALLY_FILLED" : "CANCELLED";
    case "REJECTED":
      return "REJECTED";
    case "FAILED":
      return "FAILED";
    case "TRIGGER_PENDING":
      return "TRIGGER_PENDING";
    case "NEW":
    case "ACKED":
    case "APPROVED":
    case "OPEN":
    case "PENDING":
    case "CANCELLATION_REQUESTED":
    case "MODIFICATION_REQUESTED":
      return filled > 0 ? "PARTIALLY_FILLED" : "OPEN";
    default:
      return "OPEN";
  }
}

export function isValidReference(ref: string): boolean {
  return /^[A-Za-z0-9-]{8,20}$/.test(ref) && (ref.match(/-/g) ?? []).length <= 2;
}

export async function placeGrowwOrder(token: string, o: GrowwOrderInput): Promise<{ brokerOrderId: string; brokerStatus: string; remark: string | null }> {
  if (!isValidReference(o.reference)) throw new BrokerError("unknown", "Invalid order reference");
  const p = await groww(token, "POST", "/order/create", {
    trading_symbol: o.tradingSymbol,
    quantity: o.quantity,
    price: o.orderType === "LIMIT" || o.orderType === "SL" ? o.price : 0,
    trigger_price: o.orderType === "SL" || o.orderType === "SL_M" ? o.triggerPrice : undefined,
    validity: "DAY",
    exchange: o.exchange,
    segment: o.segment,
    product: o.product,
    order_type: o.orderType,
    transaction_type: o.side,
    order_reference_id: o.reference,
  });
  const id = typeof p.groww_order_id === "string" ? p.groww_order_id : "";
  if (!id) throw new BrokerError("unknown", "Groww didn't return an order ID");
  return { brokerOrderId: id, brokerStatus: String(p.order_status ?? "NEW"), remark: typeof p.remark === "string" ? p.remark : null };
}

export async function cancelGrowwOrder(token: string, brokerOrderId: string, segment = "CASH"): Promise<string> {
  const p = await groww(token, "POST", "/order/cancel", { segment, groww_order_id: brokerOrderId });
  return String(p.order_status ?? "CANCELLATION_REQUESTED");
}

/** Current state of an order — by Groww's ID, or by our reference when the create call's answer was lost. */
export async function growwOrderState(token: string, q: { brokerOrderId?: string | null; reference: string; quantity: number; segment?: string }): Promise<GrowwOrderState> {
  const segment = q.segment ?? "CASH";
  const p = q.brokerOrderId
    ? await groww(token, "GET", `/order/detail/${encodeURIComponent(q.brokerOrderId)}?segment=${segment}`)
    : await groww(token, "GET", `/order/status/reference/${encodeURIComponent(q.reference)}?segment=${segment}`);
  const brokerStatus = String(p.order_status ?? "");
  const filled = num(p.filled_quantity) ?? 0;
  return {
    brokerOrderId: String(p.groww_order_id ?? q.brokerOrderId ?? ""),
    brokerStatus,
    status: mapGrowwStatus(brokerStatus, filled, q.quantity),
    filledQuantity: filled,
    averagePrice: num(p.average_fill_price),
    remark: typeof p.remark === "string" ? p.remark : null,
  };
}

export type GrowwPosition = { tradingSymbol: string; exchange: string; product: string; quantity: number; realisedPnl: number | null };

export async function growwPositions(token: string): Promise<GrowwPosition[]> {
  const p = await groww(token, "GET", "/positions/user?segment=CASH");
  const list = Array.isArray(p.positions) ? p.positions : [];
  return list.map((x) => {
    const r = obj(x);
    return {
      tradingSymbol: String(r.trading_symbol ?? ""),
      exchange: String(r.exchange ?? ""),
      product: String(r.product ?? ""),
      quantity: num(r.quantity) ?? num(r.net_quantity) ?? 0,
      realisedPnl: num(r.realised_pnl),
    };
  });
}

/** "RELIANCE.NS" → { tradingSymbol: "RELIANCE", exchange: "NSE" }; indices and unknown suffixes aren't tradable. */
export function growwSymbolOf(instrumentSymbol: string): { tradingSymbol: string; exchange: "NSE" | "BSE" } | null {
  const m = /^([A-Z0-9&-]+)\.(NS|BO)$/.exec(instrumentSymbol.toUpperCase());
  return m ? { tradingSymbol: m[1], exchange: m[2] === "NS" ? "NSE" : "BSE" } : null;
}
