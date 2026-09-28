import type { LiveOrderStatus } from "@prisma/client";
import { BrokerError, brokerMessage, type BrokerCreds } from "./adapters";
import { brokerFetch } from "./egress";
import type { BrokerId } from "./catalog";
import { cancelGrowwOrder, growwOrderState, placeGrowwOrder } from "./groww-orders";

// Real-order adapters, one per broker, all behind one interface. Written from
// each broker's official API docs/SDKs; every call goes through brokerFetch
// (the static-IP relay). Brokers other than Groww are "unverified" until they
// pass a real connectivity test — and every order's symbol is read back from
// the broker and checked (see live/orders.ts) before we trust it.

export type LiveCtx = { creds: BrokerCreds; token: string };

/** One order, already resolved to the exchange's identifiers. */
export type LiveRequest = {
  tradingSymbol: string; // plain NSE symbol, e.g. "RELIANCE"
  series: string; // "EQ" (or "BE")
  nseToken: string; // NSE exchange token, e.g. "2885"
  isin: string;
  tick: number;
  side: "BUY" | "SELL";
  quantity: number;
  orderType: "MARKET" | "LIMIT" | "SL" | "SL_M";
  product: "CNC" | "MIS";
  price?: number;
  triggerPrice?: number;
  reference: string; // our alphanumeric reference (idempotency / tag)
};

export type LiveReadback = {
  brokerOrderId: string;
  brokerStatus: string;
  status: LiveOrderStatus;
  filledQuantity: number;
  averagePrice: number | null;
  remark: string | null;
  /** The symbol the broker says this order is for (plain, e.g. "RELIANCE"), when it reports one. */
  symbol: string | null;
};

export type LiveBroker = {
  id: BrokerId;
  /** Proven with a real order in code review. Otherwise a broker counts as proven once a connectivity test there completes cleanly. */
  verified: boolean;
  /** Some brokers refuse market orders from algos (Angel One) — we send a protected limit instead. */
  marketOrders: boolean;
  place(ctx: LiveCtx, o: LiveRequest): Promise<{ brokerOrderId: string; brokerStatus: string; remark: string | null }>;
  cancel(ctx: LiveCtx, brokerOrderId: string): Promise<string>;
  state(ctx: LiveCtx, q: { brokerOrderId: string | null; reference: string; quantity: number }): Promise<LiveReadback>;
};

// ---------- shared plumbing ----------

const TIMEOUT_MS = 12_000;
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null);
/** "RELIANCE-EQ", "NSE:RELIANCE-EQ", "RELIANCE_EQ" → "RELIANCE". */
export const plainSymbol = (s: string | null) => (s ? s.replace(/^[A-Z]+:/, "").replace(/[-_](EQ|BE)$/i, "").toUpperCase() : null);

async function http(url: string, init: { method?: string; headers?: Record<string, string>; json?: unknown; form?: Record<string, string> }) {
  let res: { status: number; text(): Promise<string> };
  try {
    res = await brokerFetch(url, {
      method: init.method ?? "GET",
      headers: { Accept: "application/json", ...(init.json !== undefined ? { "Content-Type": "application/json" } : {}), ...(init.form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}), ...init.headers },
      body: init.json !== undefined ? JSON.stringify(init.json) : init.form ? new URLSearchParams(init.form).toString() : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    throw new BrokerError("unreachable");
  }
  const raw = await res.text();
  let body: unknown = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    // gateway error page
  }
  const b = obj(body);
  const msg = brokerMessage(b) ?? text(b.text) ?? text(b.message) ?? text(b.omsErrorDescription);
  if (res.status === 401 || res.status === 403) throw new BrokerError("session_rejected", msg ?? `answered ${res.status}`);
  if (res.status >= 500) throw new BrokerError("unreachable", msg ?? undefined);
  if (res.status >= 400) throw new BrokerError("unknown", msg ?? `answered ${res.status}`);
  return body;
}

/** Map a broker's status words onto ours (most brokers use Kite-style words). */
function mapWords(raw: string, filled: number, quantity: number): LiveOrderStatus {
  const s = raw.toLowerCase().replace(/[_-]/g, " ");
  const part = filled > 0 && filled < quantity;
  if (/(complete|traded|fully executed|executed|filled)/.test(s) && !/part/.test(s)) return part ? "PARTIALLY_FILLED" : "FILLED";
  if (/part/.test(s)) return "PARTIALLY_FILLED";
  if (/reject/.test(s)) return "REJECTED";
  if (/(cancel|expired)/.test(s) && !/pending|request/.test(s)) return filled > 0 ? "PARTIALLY_FILLED" : "CANCELLED";
  if (/trigger/.test(s)) return "TRIGGER_PENDING";
  if (/fail/.test(s)) return "FAILED";
  return filled > 0 ? "PARTIALLY_FILLED" : "OPEN";
}

// ---------- Groww ----------

const groww: LiveBroker = {
  id: "groww",
  verified: false,
  marketOrders: true,
  place: (ctx, o) =>
    placeGrowwOrder(ctx.token, {
      tradingSymbol: o.tradingSymbol,
      exchange: "NSE",
      segment: "CASH",
      product: o.product,
      orderType: o.orderType,
      side: o.side,
      quantity: o.quantity,
      price: o.price,
      triggerPrice: o.triggerPrice,
      reference: o.reference,
    }),
  cancel: (ctx, id) => cancelGrowwOrder(ctx.token, id),
  async state(ctx, q) {
    const s = await growwOrderState(ctx.token, { brokerOrderId: q.brokerOrderId, reference: q.reference, quantity: q.quantity });
    return { ...s, symbol: null };
  },
};

// ---------- Zerodha (Kite Connect v3) ----------

const KITE = "https://api.kite.trade";
const kiteHeaders = (ctx: LiveCtx) => ({ "X-Kite-Version": "3", Authorization: `token ${ctx.creds.apiKey}:${ctx.token}` });
const kiteType = { MARKET: "MARKET", LIMIT: "LIMIT", SL: "SL", SL_M: "SL-M" } as const;

const zerodha: LiveBroker = {
  id: "zerodha",
  verified: false,
  marketOrders: true,
  async place(ctx, o) {
    const body = obj(
      await http(`${KITE}/orders/regular`, {
        method: "POST",
        headers: kiteHeaders(ctx),
        form: {
          tradingsymbol: o.tradingSymbol,
          exchange: "NSE",
          transaction_type: o.side,
          order_type: kiteType[o.orderType],
          quantity: String(o.quantity),
          product: o.product,
          validity: "DAY",
          ...(o.price !== undefined && (o.orderType === "LIMIT" || o.orderType === "SL") ? { price: String(o.price) } : {}),
          ...(o.triggerPrice !== undefined && (o.orderType === "SL" || o.orderType === "SL_M") ? { trigger_price: String(o.triggerPrice) } : {}),
          ...(o.orderType === "MARKET" || o.orderType === "SL_M" ? { market_protection: "-1" } : {}),
          tag: o.reference.slice(0, 20),
        },
      }),
    );
    const id = text(obj(body.data).order_id);
    if (!id) throw new BrokerError("unknown", "Zerodha didn't return an order ID");
    return { brokerOrderId: id, brokerStatus: "PUT ORDER REQ RECEIVED", remark: null };
  },
  async cancel(ctx, id) {
    await http(`${KITE}/orders/regular/${encodeURIComponent(id)}`, { method: "DELETE", headers: kiteHeaders(ctx) });
    return "CANCEL PENDING";
  },
  async state(ctx, q) {
    let row: Record<string, unknown> | undefined;
    if (q.brokerOrderId) {
      const hist = arr(obj(await http(`${KITE}/orders/${encodeURIComponent(q.brokerOrderId)}`, { headers: kiteHeaders(ctx) })).data);
      row = obj(hist[hist.length - 1]);
    } else {
      row = arr(obj(await http(`${KITE}/orders`, { headers: kiteHeaders(ctx) })).data)
        .map(obj)
        .find((o) => o.tag === q.reference.slice(0, 20));
      if (!row) throw new BrokerError("unknown", "Order not found at Zerodha yet");
    }
    const filled = num(row.filled_quantity) ?? 0;
    const status = String(row.status ?? "");
    return { brokerOrderId: text(row.order_id) ?? q.brokerOrderId ?? "", brokerStatus: status, status: mapWords(status, filled, q.quantity), filledQuantity: filled, averagePrice: num(row.average_price) || null, remark: text(row.status_message), symbol: plainSymbol(text(row.tradingsymbol)) };
  },
};

// ---------- Upstox (v2 order APIs; instrument keyed by ISIN) ----------

const upstoxHeaders = (ctx: LiveCtx) => ({ Authorization: `Bearer ${ctx.token}` });
const upstoxType = { MARKET: "MARKET", LIMIT: "LIMIT", SL: "SL", SL_M: "SL-M" } as const;

const upstox: LiveBroker = {
  id: "upstox",
  verified: false,
  marketOrders: true,
  async place(ctx, o) {
    const body = obj(
      await http("https://api-hft.upstox.com/v2/order/place", {
        method: "POST",
        headers: upstoxHeaders(ctx),
        json: {
          quantity: o.quantity,
          product: o.product === "CNC" ? "D" : "I",
          validity: "DAY",
          price: o.orderType === "LIMIT" || o.orderType === "SL" ? o.price : 0,
          tag: o.reference,
          instrument_token: `NSE_EQ|${o.isin}`,
          order_type: upstoxType[o.orderType],
          transaction_type: o.side,
          disclosed_quantity: 0,
          trigger_price: o.orderType === "SL" || o.orderType === "SL_M" ? o.triggerPrice : 0,
          is_amo: false,
        },
      }),
    );
    const id = text(obj(body.data).order_id);
    if (!id) throw new BrokerError("unknown", "Upstox didn't return an order ID");
    return { brokerOrderId: id, brokerStatus: "put order req received", remark: null };
  },
  async cancel(ctx, id) {
    await http(`https://api-hft.upstox.com/v2/order/cancel?order_id=${encodeURIComponent(id)}`, { method: "DELETE", headers: upstoxHeaders(ctx) });
    return "cancel pending";
  },
  async state(ctx, q) {
    const qs = q.brokerOrderId ? `order_id=${encodeURIComponent(q.brokerOrderId)}` : `tag=${encodeURIComponent(q.reference)}`;
    const d = obj(obj(await http(`https://api.upstox.com/v2/order/details?${qs}`, { headers: upstoxHeaders(ctx) })).data);
    const filled = num(d.filled_quantity) ?? 0;
    const status = String(d.status ?? "");
    return { brokerOrderId: text(d.order_id) ?? q.brokerOrderId ?? "", brokerStatus: status, status: mapWords(status, filled, q.quantity), filledQuantity: filled, averagePrice: num(d.average_price) || null, remark: text(d.status_message), symbol: plainSymbol(text(d.trading_symbol)) };
  },
};

// ---------- Fyers (API v3) ----------

const FYERS = "https://api-t1.fyers.in/api/v3";
const fyersHeaders = (ctx: LiveCtx) => ({ Authorization: `${ctx.creds.apiKey}:${ctx.token}` });
const fyersType = { LIMIT: 1, MARKET: 2, SL_M: 3, SL: 4 } as const;
const FYERS_STATUS: Record<number, string> = { 1: "cancelled", 2: "traded", 4: "transit", 5: "rejected", 6: "pending", 7: "expired" };

const fyers: LiveBroker = {
  id: "fyers",
  verified: false,
  marketOrders: true,
  async place(ctx, o) {
    const b = obj(
      await http(`${FYERS}/orders/sync`, {
        method: "POST",
        headers: fyersHeaders(ctx),
        json: {
          symbol: `NSE:${o.tradingSymbol}-${o.series}`,
          qty: o.quantity,
          type: fyersType[o.orderType],
          side: o.side === "BUY" ? 1 : -1,
          productType: o.product === "CNC" ? "CNC" : "INTRADAY",
          limitPrice: o.orderType === "LIMIT" || o.orderType === "SL" ? o.price : 0,
          stopPrice: o.orderType === "SL" || o.orderType === "SL_M" ? o.triggerPrice : 0,
          validity: "DAY",
          disclosedQty: 0,
          offlineOrder: false,
          orderTag: o.reference,
        },
      }),
    );
    const id = text(b.id);
    if (b.s !== "ok" || !id) throw new BrokerError("unknown", text(b.message) ?? "Fyers didn't return an order ID");
    return { brokerOrderId: id, brokerStatus: "transit", remark: text(b.message) };
  },
  async cancel(ctx, id) {
    await http(`${FYERS}/orders/sync`, { method: "DELETE", headers: fyersHeaders(ctx), json: { id } });
    return "cancel requested";
  },
  async state(ctx, q) {
    const book = arr(obj(await http(q.brokerOrderId ? `${FYERS}/orders?id=${encodeURIComponent(q.brokerOrderId)}` : `${FYERS}/orders`, { headers: fyersHeaders(ctx) })).orderBook).map(obj);
    const row = q.brokerOrderId ? book.find((o) => text(o.id) === q.brokerOrderId) : book.find((o) => o.orderTag === q.reference || String(o.orderTag ?? "").endsWith(q.reference));
    if (!row) throw new BrokerError("unknown", "Order not found at Fyers yet");
    const filled = num(row.filledQty) ?? 0;
    const status = FYERS_STATUS[num(row.status) ?? 0] ?? String(row.status ?? "");
    return { brokerOrderId: text(row.id) ?? "", brokerStatus: status, status: mapWords(status, filled, q.quantity), filledQuantity: filled, averagePrice: num(row.tradedPrice) || null, remark: text(row.message), symbol: plainSymbol(text(row.symbol)) };
  },
};

// ---------- Angel One (SmartAPI) ----------

const ANGEL = "https://apiconnect.angelone.in/rest/secure/angelbroking/order/v1";
const angelHeaders = (ctx: LiveCtx) => ({
  "X-UserType": "USER",
  "X-SourceID": "WEB",
  "X-ClientLocalIP": "127.0.0.1",
  "X-ClientPublicIP": "127.0.0.1",
  "X-MACAddress": "00:00:00:00:00:00",
  "X-PrivateKey": ctx.creds.apiKey,
  Authorization: `Bearer ${ctx.token}`,
});
const angelType = { MARKET: "MARKET", LIMIT: "LIMIT", SL: "STOPLOSS_LIMIT", SL_M: "STOPLOSS_MARKET" } as const;
/** Angel One order IDs are stored as "orderid:uniqueorderid" (cancel needs one, status the other). */
const angelIds = (id: string) => {
  const [orderid, unique] = id.split(":");
  return { orderid, unique: unique || orderid };
};

const angelone: LiveBroker = {
  id: "angelone",
  verified: false,
  // Angel One rejects MARKET and IOC orders from algos; live/orders.ts sends a protected LIMIT instead.
  marketOrders: false,
  async place(ctx, o) {
    const stop = o.orderType === "SL" || o.orderType === "SL_M";
    const b = obj(
      await http(`${ANGEL}/placeOrder`, {
        method: "POST",
        headers: angelHeaders(ctx),
        json: {
          variety: stop ? "STOPLOSS" : "NORMAL",
          tradingsymbol: `${o.tradingSymbol}-${o.series}`,
          symboltoken: o.nseToken,
          transactiontype: o.side,
          exchange: "NSE",
          ordertype: angelType[o.orderType],
          producttype: o.product === "CNC" ? "DELIVERY" : "INTRADAY",
          duration: "DAY",
          price: String(o.price ?? 0),
          triggerprice: String(o.triggerPrice ?? 0),
          squareoff: "0",
          stoploss: "0",
          quantity: String(o.quantity),
          ordertag: o.reference,
        },
      }),
    );
    const d = obj(b.data);
    const orderid = text(d.orderid);
    if (b.status === false || !orderid) throw new BrokerError("unknown", text(b.message) ?? "Angel One didn't return an order ID");
    return { brokerOrderId: `${orderid}:${text(d.uniqueorderid) ?? ""}`, brokerStatus: "open pending", remark: text(b.message) };
  },
  async cancel(ctx, id) {
    const { orderid } = angelIds(id);
    await http(`${ANGEL}/cancelOrder`, { method: "POST", headers: angelHeaders(ctx), json: { variety: "NORMAL", orderid } });
    return "cancel pending";
  },
  async state(ctx, q) {
    let d: Record<string, unknown>;
    if (q.brokerOrderId && angelIds(q.brokerOrderId).unique) {
      d = obj(obj(await http(`${ANGEL}/details/${encodeURIComponent(angelIds(q.brokerOrderId).unique)}`, { headers: angelHeaders(ctx) })).data);
    } else {
      d = arr(obj(await http(`${ANGEL}/getOrderBook`, { headers: angelHeaders(ctx) })).data)
        .map(obj)
        .find((o) => o.ordertag === q.reference) ?? {};
      if (!text(d.orderid)) throw new BrokerError("unknown", "Order not found at Angel One yet");
    }
    const filled = num(d.filledshares) ?? 0;
    const status = String(d.status ?? d.orderstatus ?? "");
    const id = q.brokerOrderId ?? `${text(d.orderid) ?? ""}:${text(d.uniqueorderid) ?? ""}`;
    return { brokerOrderId: id, brokerStatus: status, status: mapWords(status, filled, q.quantity), filledQuantity: filled, averagePrice: num(d.averageprice) || null, remark: text(d.text), symbol: plainSymbol(text(d.tradingsymbol)) };
  },
};

/** Angel One's last traded price, used to protect a would-be market order. */
export async function angelLtp(ctx: LiveCtx, o: { tradingSymbol: string; series: string; nseToken: string }): Promise<number> {
  const d = obj(obj(await http(`${ANGEL}/getLtpData`, { method: "POST", headers: angelHeaders(ctx), json: { exchange: "NSE", tradingsymbol: `${o.tradingSymbol}-${o.series}`, symboltoken: o.nseToken } })).data);
  const ltp = num(d.ltp);
  if (!ltp) throw new BrokerError("unknown", "Angel One didn't return a price");
  return ltp;
}

// ---------- Dhan (DhanHQ v2) ----------

const DHAN = "https://api.dhan.co/v2";
const dhanHeaders = (ctx: LiveCtx) => ({ "access-token": ctx.token });
const dhanType = { MARKET: "MARKET", LIMIT: "LIMIT", SL: "STOP_LOSS", SL_M: "STOP_LOSS_MARKET" } as const;

const dhan: LiveBroker = {
  id: "dhan",
  verified: false,
  marketOrders: true,
  async place(ctx, o) {
    if (!ctx.creds.clientId) throw new BrokerError("missing_client_id");
    const b = obj(
      await http(`${DHAN}/orders`, {
        method: "POST",
        headers: dhanHeaders(ctx),
        json: {
          dhanClientId: ctx.creds.clientId,
          correlationId: o.reference,
          transactionType: o.side,
          exchangeSegment: "NSE_EQ",
          productType: o.product === "CNC" ? "CNC" : "INTRADAY",
          orderType: dhanType[o.orderType],
          validity: "DAY",
          securityId: o.nseToken,
          quantity: o.quantity,
          price: o.orderType === "LIMIT" || o.orderType === "SL" ? o.price : 0,
          triggerPrice: o.orderType === "SL" || o.orderType === "SL_M" ? o.triggerPrice : 0,
        },
      }),
    );
    const id = text(b.orderId);
    if (!id) throw new BrokerError("unknown", "Dhan didn't return an order ID");
    return { brokerOrderId: id, brokerStatus: String(b.orderStatus ?? "TRANSIT"), remark: null };
  },
  async cancel(ctx, id) {
    const b = obj(await http(`${DHAN}/orders/${encodeURIComponent(id)}`, { method: "DELETE", headers: dhanHeaders(ctx) }));
    return String(b.orderStatus ?? "CANCELLED");
  },
  async state(ctx, q) {
    const raw = await http(q.brokerOrderId ? `${DHAN}/orders/${encodeURIComponent(q.brokerOrderId)}` : `${DHAN}/orders/external/${encodeURIComponent(q.reference)}`, { headers: dhanHeaders(ctx) });
    const d = obj(Array.isArray(raw) ? raw[0] : raw);
    const filled = num(d.filledQty) ?? 0;
    const status = String(d.orderStatus ?? "");
    return { brokerOrderId: text(d.orderId) ?? q.brokerOrderId ?? "", brokerStatus: status, status: mapWords(status, filled, q.quantity), filledQuantity: filled, averagePrice: num(d.averageTradedPrice) || null, remark: text(d.omsErrorDescription), symbol: plainSymbol(text(d.tradingSymbol)) };
  },
};

// ---------- 5paisa (Xstream OpenAPI) ----------

const FIVEPAISA = "https://Openapi.5paisa.com/VendorsAPI/Service1.svc";
const fpHeaders = (ctx: LiveCtx) => ({ Authorization: `Bearer ${ctx.token}` });
/** The client code sits in the session token (JWT "unique_name"). */
function fpClientCode(token: string): string {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")) as Record<string, unknown>;
    return String(payload.unique_name ?? "");
  } catch {
    return "";
  }
}

const fivepaisa: LiveBroker = {
  id: "5paisa",
  verified: false,
  marketOrders: true,
  async place(ctx, o) {
    const clientCode = fpClientCode(ctx.token);
    const limit = o.orderType === "LIMIT" || o.orderType === "SL";
    const stop = o.orderType === "SL" || o.orderType === "SL_M";
    const b = obj(
      obj(
        await http(`${FIVEPAISA}/V1/PlaceOrderRequest`, {
          method: "POST",
          headers: fpHeaders(ctx),
          json: {
            head: { key: ctx.creds.apiKey },
            body: {
              ClientCode: clientCode,
              OrderType: o.side === "BUY" ? "B" : "S",
              Exchange: "N",
              ExchangeType: "C",
              ScripCode: Number(o.nseToken),
              Price: limit ? o.price : 0,
              Qty: o.quantity,
              DisQty: 0,
              IsIntraday: o.product === "MIS",
              IsStopLossOrder: stop,
              StopLossPrice: stop ? o.triggerPrice : 0,
              iOrderValidity: 0,
              AHPlaced: "N",
              RemoteOrderID: o.reference,
            },
          },
        }),
      ).body,
    );
    if (b.Status !== 0 && b.Status !== "0") throw new BrokerError("unknown", text(b.Message) ?? "5paisa refused the order");
    const id = text(b.BrokerOrderID) ?? text(b.ExchOrderID);
    if (!id) throw new BrokerError("unknown", "5paisa didn't return an order ID");
    return { brokerOrderId: id, brokerStatus: "Pending", remark: text(b.Message) };
  },
  async cancel(ctx, id) {
    // Cancelling needs the exchange order ID, which appears once the order reaches the exchange.
    const b = obj(obj(await http(`${FIVEPAISA}/V1/CancelOrderRequest`, { method: "POST", headers: fpHeaders(ctx), json: { head: { key: ctx.creds.apiKey }, body: { ExchOrderID: id } } })).body);
    if (b.Status !== 0 && b.Status !== "0") throw new BrokerError("unknown", text(b.Message) ?? "5paisa refused the cancel");
    return "Cancel requested";
  },
  async state(ctx, q) {
    const b = obj(
      obj(
        await http(`${FIVEPAISA}/V2/OrderStatus`, {
          method: "POST",
          headers: fpHeaders(ctx),
          json: { head: { key: ctx.creds.apiKey }, body: { ClientCode: fpClientCode(ctx.token), OrdStatusReqList: [{ Exch: "N", RemoteOrderID: q.reference }] } },
        }),
      ).body,
    );
    const row = obj(arr(b.OrdStatusResLst)[0]);
    const filled = num(row.TradedQty) ?? 0;
    const status = String(row.Status ?? "");
    // Store the exchange order ID once known — 5paisa cancels by it.
    const id = text(row.ExchOrderID) && text(row.ExchOrderID) !== "0" ? text(row.ExchOrderID)! : (q.brokerOrderId ?? "");
    return { brokerOrderId: id, brokerStatus: status, status: mapWords(status, filled, q.quantity), filledQuantity: filled, averagePrice: num(row.OrderRate) || null, remark: text(row.Message) ?? null, symbol: plainSymbol(text(row.Symbol)) };
  },
};

// ---------- Alice Blue (open API v1) ----------

const ALICE = "https://a3.aliceblueonline.com/open-api/od/v1";
const aliceHeaders = (ctx: LiveCtx) => ({ Authorization: `Bearer ${ctx.token}` });
const aliceType = { MARKET: "MARKET", LIMIT: "LIMIT", SL: "SL", SL_M: "SLM" } as const;

const aliceblue: LiveBroker = {
  id: "aliceblue",
  verified: false,
  marketOrders: true,
  async place(ctx, o) {
    const raw = await http(`${ALICE}/orders/placeorder`, {
      method: "POST",
      headers: aliceHeaders(ctx),
      json: [
        {
          exchange: "NSE",
          instrumentId: o.nseToken,
          transactionType: o.side,
          quantity: o.quantity,
          product: o.product === "CNC" ? "LONGTERM" : "INTRADAY",
          orderComplexity: "REGULAR",
          orderType: aliceType[o.orderType],
          price: o.orderType === "LIMIT" || o.orderType === "SL" ? o.price : 0,
          slTriggerPrice: o.orderType === "SL" || o.orderType === "SL_M" ? o.triggerPrice : 0,
          validity: "DAY",
          orderTag: o.reference,
        },
      ],
    });
    const b = obj(raw);
    const first = obj(arr(b.result)[0] ?? arr(raw)[0] ?? b);
    const id = text(first.brokerOrderId) ?? text(first.orderNumber) ?? text(first.nestOrderNumber);
    if (!id) throw new BrokerError("unknown", text(first.message) ?? text(b.message) ?? "Alice Blue didn't return an order ID");
    return { brokerOrderId: id, brokerStatus: "OPEN", remark: text(first.message) };
  },
  async cancel(ctx, id) {
    await http(`${ALICE}/orders/cancel`, { method: "POST", headers: aliceHeaders(ctx), json: { brokerOrderId: id } });
    return "CANCEL REQUESTED";
  },
  async state(ctx, q) {
    const raw = await http(`${ALICE}/orders/book`, { headers: aliceHeaders(ctx) });
    const list = [...arr(obj(raw).result), ...arr(raw)].map(obj);
    const row = list.find((o) => (q.brokerOrderId && text(o.brokerOrderId) === q.brokerOrderId) || o.orderTag === q.reference);
    if (!row) throw new BrokerError("unknown", "Order not found at Alice Blue yet");
    const filled = num(row.filledQuantity) ?? 0;
    const status = String(row.orderStatus ?? "");
    return { brokerOrderId: text(row.brokerOrderId) ?? q.brokerOrderId ?? "", brokerStatus: status, status: mapWords(status, filled, q.quantity), filledQuantity: filled, averagePrice: num(row.averageTradedPrice) || null, remark: text(row.rejectionReason), symbol: plainSymbol(text(row.tradingSymbol)) };
  },
};

export const LIVE_BROKERS: Partial<Record<BrokerId, LiveBroker>> = { groww, zerodha, upstox, fyers, angelone, dhan, "5paisa": fivepaisa, aliceblue };

/** Brokers where connecting works but live orders don't yet, with why. */
export const LIVE_NOT_YET: Partial<Record<BrokerId, string>> = {
  icicidirect: "ICICI Direct identifies stocks by its own codes, which it only publishes in a large download — live orders will follow once that lookup is built.",
};

export { mapWords as mapBrokerStatus };
