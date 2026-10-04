import "server-only";
import type { BrokerId } from "./catalog";
import { ANGEL, angelHeaders, arr, DHAN, dhanHeaders, FIVEPAISA, fpClientCode, fpHeaders, FYERS, fyersHeaders, http, KITE, kiteHeaders, num, obj, text, upstoxHeaders, type LiveCtx } from "./live-brokers";

// Read-only account data from a user's own broker: profile, funds, holdings,
// positions, today's orders and trades — whatever each broker's API returns.
// GET-style calls only; nothing here changes anything at the broker. Every
// broker names fields differently, so each reader maps them onto one shape.

export type AccountProfile = { name: string | null; clientId: string | null; email: string | null };
/** `lines` is every figure the broker sent, under its own name, so the page can show how the three headline numbers were reached. */
export type AccountFunds = { available: number | null; used: number | null; total: number | null; lines?: { name: string; value: number }[] };
export type AccountHolding = { symbol: string; exchange: string | null; quantity: number; avgPrice: number | null; ltp: number | null; pnl: number | null };
export type AccountPosition = { symbol: string; exchange: string | null; product: string | null; quantity: number; avgPrice: number | null; ltp: number | null; pnl: number | null; realised: number | null };
export type AccountOrder = { id: string; symbol: string; side: string; quantity: number; filled: number; price: number | null; avgPrice: number | null; status: string; time: string | null };
export type AccountTrade = { id: string; orderId: string | null; symbol: string; side: string; quantity: number; price: number | null; time: string | null };

export type AccountReader = {
  profile?(ctx: LiveCtx): Promise<AccountProfile>;
  funds?(ctx: LiveCtx): Promise<AccountFunds>;
  holdings?(ctx: LiveCtx): Promise<AccountHolding[]>;
  positions?(ctx: LiveCtx): Promise<AccountPosition[]>;
  orders?(ctx: LiveCtx): Promise<AccountOrder[]>;
  trades?(ctx: LiveCtx): Promise<AccountTrade[]>;
};

/** First present number / text among several possible field names. */
const n = (r: Record<string, unknown>, ...keys: string[]) => {
  for (const k of keys) {
    const v = num(r[k]);
    if (v !== null) return v;
  }
  return null;
};
const t = (r: Record<string, unknown>, ...keys: string[]) => {
  for (const k of keys) {
    const v = text(r[k]);
    if (v !== null) return v;
  }
  return null;
};
const sideOf = (v: unknown) => {
  const s = String(v ?? "").toUpperCase();
  return s === "1" || s.startsWith("B") ? "BUY" : s === "-1" || s.startsWith("S") ? "SELL" : s;
};
const rows = (v: unknown) => arr(v).map(obj);
/** Every numeric field of a broker's funds reply (one level of nesting), under the broker's own names. */
export function numericLines(r: Record<string, unknown>, prefix = "", depth = 0): { name: string; value: number }[] {
  const out: { name: string; value: number }[] = [];
  for (const [k, v] of Object.entries(r)) {
    const nv = num(v);
    if (nv !== null && typeof v !== "boolean") out.push({ name: `${prefix}${k}`, value: nv });
    else if (depth < 1 && v && typeof v === "object" && !Array.isArray(v)) out.push(...numericLines(v as Record<string, unknown>, `${prefix}${k}.`, depth + 1));
  }
  return out;
}

function holding(r: Record<string, unknown>): AccountHolding {
  return {
    symbol: t(r, "tradingsymbol", "trading_symbol", "tradingSymbol", "symbol", "Symbol") ?? "?",
    exchange: t(r, "exchange", "Exch", "exchangeSegment"),
    quantity: n(r, "quantity", "totalQty", "Quantity", "qty", "availableQty") ?? 0,
    avgPrice: n(r, "average_price", "averageprice", "avgCostPrice", "costPrice", "AvgRate"),
    ltp: n(r, "last_price", "ltp", "lastTradedPrice", "CurrentPrice"),
    pnl: n(r, "pnl", "profitandloss", "pl"),
  };
}
function position(r: Record<string, unknown>): AccountPosition {
  return {
    symbol: t(r, "tradingsymbol", "trading_symbol", "tradingSymbol", "symbol", "ScripName") ?? "?",
    exchange: t(r, "exchange", "exchangeSegment", "Exch"),
    product: t(r, "product", "producttype", "productType", "OrderFor"),
    quantity: n(r, "quantity", "netqty", "netQty", "net_quantity", "NetQty") ?? 0,
    avgPrice: n(r, "average_price", "avgnetprice", "netAvg", "buyAvg", "costPrice", "AvgRate", "net_price"),
    ltp: n(r, "last_price", "ltp", "LTP"),
    pnl: n(r, "pnl", "pl", "unrealizedProfit", "MTOM"),
    realised: n(r, "realised", "realised_pnl", "realized_profit", "realizedProfit", "BookedPL"),
  };
}
function order(r: Record<string, unknown>): AccountOrder {
  return {
    id: t(r, "order_id", "orderid", "orderId", "id", "groww_order_id", "BrokerOrderId") ?? "",
    symbol: t(r, "tradingsymbol", "trading_symbol", "tradingSymbol", "symbol", "ScripName") ?? "?",
    side: sideOf(r.transaction_type ?? r.transactiontype ?? r.transactionType ?? r.side ?? r.BuySell),
    quantity: n(r, "quantity", "qty", "Qty") ?? 0,
    filled: n(r, "filled_quantity", "filledshares", "filledQty", "TradedQty") ?? 0,
    price: n(r, "price", "limitPrice", "Rate"),
    avgPrice: n(r, "average_price", "averageprice", "averageTradedPrice", "tradedPrice", "average_fill_price"),
    status: t(r, "status", "orderstatus", "orderStatus", "order_status", "OrderStatus") ?? "",
    time: t(r, "order_timestamp", "updatetime", "createTime", "orderDateTime", "created_at", "BrokerOrderTime"),
  };
}
function trade(r: Record<string, unknown>): AccountTrade {
  return {
    id: t(r, "trade_id", "tradeid", "exchangeTradeId", "tradeNumber", "ExchangeTradeID") ?? "",
    orderId: t(r, "order_id", "orderid", "orderId", "orderNumber", "ExchOrderID"),
    symbol: t(r, "tradingsymbol", "trading_symbol", "tradingSymbol", "symbol", "ScripName") ?? "?",
    side: sideOf(r.transaction_type ?? r.transactiontype ?? r.transactionType ?? r.side ?? r.BuySell),
    quantity: n(r, "quantity", "fillsize", "tradedQuantity", "tradedQty", "Qty") ?? 0,
    price: n(r, "average_price", "fillprice", "tradedPrice", "tradePrice", "Rate"),
    time: t(r, "fill_timestamp", "filltime", "exchangeTime", "orderDateTime", "createTime", "TradeTime"),
  };
}

// ---------- per broker ----------

const growwGet = async (ctx: LiveCtx, path: string) =>
  obj(obj(await http(`https://api.groww.in/v1${path}`, { headers: { Authorization: `Bearer ${ctx.token}`, "X-API-VERSION": "1.0" } })).payload);

/**
 * Cash and F&O are separate calls. One failing is fine (an account without F&O answers only
 * for cash); both failing means the broker refused us, and that must show — not read as "no orders".
 */
async function bothSegments<T>(a: Promise<T>, b: Promise<T>): Promise<[T | Record<string, never>, T | Record<string, never>]> {
  const [x, y] = await Promise.allSettled([a, b]);
  if (x.status === "rejected" && y.status === "rejected") throw x.reason;
  return [x.status === "fulfilled" ? x.value : {}, y.status === "fulfilled" ? y.value : {}];
}

const groww: AccountReader = {
  async funds(ctx) {
    const p = await growwGet(ctx, "/margins/detail/user");
    // Groww states no account total, so none is shown as if it were one (the page offers an estimate, labelled as such).
    return { available: n(p, "clear_cash", "available_margin", "net_margin_available"), used: n(p, "net_margin_used", "margin_used"), total: n(p, "total_margin"), lines: numericLines(p) };
  },
  holdings: async (ctx) => rows((await growwGet(ctx, "/holdings/user")).holdings).map(holding),
  async positions(ctx) {
    const [cash, fno] = await bothSegments(growwGet(ctx, "/positions/user?segment=CASH"), growwGet(ctx, "/positions/user?segment=FNO"));
    return [...rows(obj(cash).positions), ...rows(obj(fno).positions)].map(position);
  },
  async orders(ctx) {
    const [cash, fno] = await bothSegments(growwGet(ctx, "/order/list?segment=CASH&page=0&page_size=100"), growwGet(ctx, "/order/list?segment=FNO&page=0&page_size=100"));
    return [...rows(obj(cash).order_list), ...rows(obj(fno).order_list)].map(order);
  },
};

const kiteGet = async (ctx: LiveCtx, path: string) => obj(await http(`${KITE}${path}`, { headers: kiteHeaders(ctx) })).data;
const zerodha: AccountReader = {
  async profile(ctx) {
    const d = obj(await kiteGet(ctx, "/user/profile"));
    return { name: t(d, "user_name"), clientId: t(d, "user_id"), email: t(d, "email") };
  },
  async funds(ctx) {
    const e = obj(obj(await kiteGet(ctx, "/user/margins")).equity);
    return { available: n(obj(e.available), "live_balance", "cash"), used: n(obj(e.utilised), "debits"), total: n(e, "net") };
  },
  holdings: async (ctx) => rows(await kiteGet(ctx, "/portfolio/holdings")).map(holding),
  positions: async (ctx) => rows(obj(await kiteGet(ctx, "/portfolio/positions")).net).map(position),
  orders: async (ctx) => rows(await kiteGet(ctx, "/orders")).map(order),
  trades: async (ctx) => rows(await kiteGet(ctx, "/trades")).map(trade),
};

const upGet = async (ctx: LiveCtx, path: string) => obj(await http(`https://api.upstox.com/v2${path}`, { headers: upstoxHeaders(ctx) })).data;
const upstox: AccountReader = {
  async profile(ctx) {
    const d = obj(await upGet(ctx, "/user/profile"));
    return { name: t(d, "user_name"), clientId: t(d, "user_id"), email: t(d, "email") };
  },
  async funds(ctx) {
    const e = obj(obj(await upGet(ctx, "/user/get-funds-and-margin")).equity);
    return { available: n(e, "available_margin"), used: n(e, "used_margin"), total: null };
  },
  holdings: async (ctx) => rows(await upGet(ctx, "/portfolio/long-term-holdings")).map(holding),
  positions: async (ctx) => rows(await upGet(ctx, "/portfolio/short-term-positions")).map(position),
  orders: async (ctx) => rows(await upGet(ctx, "/order/retrieve-all")).map(order),
  trades: async (ctx) => rows(await upGet(ctx, "/order/trades/get-trades-for-day")).map(trade),
};

const fyGet = async (ctx: LiveCtx, path: string) => obj(await http(`${FYERS}${path}`, { headers: fyersHeaders(ctx) }));
const fyers: AccountReader = {
  async profile(ctx) {
    const d = obj((await fyGet(ctx, "/profile")).data);
    return { name: t(d, "name"), clientId: t(d, "fy_id"), email: t(d, "email_id") };
  },
  async funds(ctx) {
    const lines = rows((await fyGet(ctx, "/funds")).fund_limit);
    const pick = (title: RegExp) => n(lines.find((l) => title.test(String(l.title ?? ""))) ?? {}, "equityAmount");
    return { available: pick(/available/i), used: pick(/utili[sz]ed/i), total: pick(/total/i) };
  },
  holdings: async (ctx) => rows((await fyGet(ctx, "/holdings")).holdings).map(holding),
  positions: async (ctx) => rows((await fyGet(ctx, "/positions")).netPositions).map(position),
  orders: async (ctx) => rows((await fyGet(ctx, "/orders")).orderBook).map(order),
  trades: async (ctx) => rows((await fyGet(ctx, "/tradebook")).tradeBook).map(trade),
};

const ANGEL_ROOT = ANGEL.replace(/\/order\/v1$/, "");
const agGet = async (ctx: LiveCtx, path: string) => obj(await http(`${ANGEL_ROOT}${path}`, { headers: angelHeaders(ctx) })).data;
const angelone: AccountReader = {
  async profile(ctx) {
    const d = obj(await agGet(ctx, "/user/v1/getProfile"));
    return { name: t(d, "name"), clientId: t(d, "clientcode"), email: t(d, "email") };
  },
  async funds(ctx) {
    const d = obj(await agGet(ctx, "/user/v1/getRMS"));
    return { available: n(d, "availablecash"), used: n(d, "utiliseddebits"), total: n(d, "net") };
  },
  holdings: async (ctx) => rows(obj(await agGet(ctx, "/portfolio/v1/getAllHolding")).holdings).map(holding),
  positions: async (ctx) => rows(await agGet(ctx, "/order/v1/getPosition")).map(position),
  orders: async (ctx) => rows(await agGet(ctx, "/order/v1/getOrderBook")).map(order),
  trades: async (ctx) => rows(await agGet(ctx, "/order/v1/getTradeBook")).map(trade),
};

const dhGet = async (ctx: LiveCtx, path: string) => http(`${DHAN}${path}`, { headers: dhanHeaders(ctx) });
const dhan: AccountReader = {
  async funds(ctx) {
    const d = obj(await dhGet(ctx, "/fundlimit"));
    return { available: n(d, "availabelBalance", "availableBalance"), used: n(d, "utilizedAmount"), total: n(d, "sodLimit") };
  },
  holdings: async (ctx) => rows(await dhGet(ctx, "/holdings")).map(holding),
  async positions(ctx) {
    return rows(await dhGet(ctx, "/positions")).map((r) => ({ ...position(r), pnl: n(r, "unrealizedProfit") }));
  },
  orders: async (ctx) => rows(await dhGet(ctx, "/orders")).map(order),
  trades: async (ctx) => rows(await dhGet(ctx, "/trades")).map(trade),
};

const fpPost = async (ctx: LiveCtx, path: string) =>
  obj(obj(await http(`${FIVEPAISA}${path}`, { method: "POST", headers: fpHeaders(ctx), json: { head: { key: ctx.creds.apiKey }, body: { ClientCode: fpClientCode(ctx.token) } } })).body);
const fivepaisa: AccountReader = {
  async funds(ctx) {
    const m = obj(rows((await fpPost(ctx, "/V4/Margin")).EquityMargin)[0]);
    return { available: n(m, "NetAvailableMargin", "ALB"), used: n(m, "MarginUtilized"), total: null };
  },
  holdings: async (ctx) => rows((await fpPost(ctx, "/V3/Holding")).Data).map(holding),
  positions: async (ctx) => rows((await fpPost(ctx, "/V2/NetPositionNetWise")).NetPositionDetail).map(position),
  orders: async (ctx) => rows((await fpPost(ctx, "/V3/OrderBook")).OrderBookDetail).map(order),
  trades: async (ctx) => rows((await fpPost(ctx, "/V1/TradeBook")).TradeBookDetail).map(trade),
};

export const ACCOUNT_READERS: Partial<Record<BrokerId, AccountReader>> = { groww, zerodha, upstox, fyers, angelone, dhan, "5paisa": fivepaisa };
export const ACCOUNT_SECTIONS = ["profile", "funds", "holdings", "positions", "orders", "trades"] as const;
export type AccountSection = (typeof ACCOUNT_SECTIONS)[number];
