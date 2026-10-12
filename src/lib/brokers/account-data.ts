import "server-only";
import type { BrokerId } from "./catalog";
import { ANGEL, angelHeaders, arr, DHAN, dhanHeaders, xtsHeaders, xtsUrl, PAYTM, paytmHeaders, HDFCSKY, hdfcskyHeaders, hdfcskyQuery, MOTILAL, motilalHeadersFor, INDSTOCKS, indstocksHeaders, FIVEPAISA, fpClientCode, fpHeaders, FYERS, fyersHeaders, http, KITE, kiteHeaders, num, obj, text, upstoxHeaders, type LiveCtx } from "./live-brokers";

// Read-only account data from a user's own broker: profile, funds, holdings,
// positions, today's orders and trades — whatever each broker's API returns.
// GET-style calls only; nothing here changes anything at the broker. Every
// broker names fields differently, so each reader maps them onto one shape.

export type AccountProfile = { name: string | null; clientId: string | null; email: string | null };
/** `lines` is every figure the broker sent, under its own name, so the page can show how the three headline numbers were reached. */
export type AccountFunds = { available: number | null; used: number | null; total: number | null; lines?: { name: string; value: number }[] };
export type AccountHolding = { symbol: string; exchange: string | null; quantity: number; avgPrice: number | null; ltp: number | null; pnl: number | null };
export type AccountPosition = { symbol: string; exchange: string | null; product: string | null; quantity: number; avgPrice: number | null; ltp: number | null; pnl: number | null; realised: number | null };
export type AccountOrder = { id: string; symbol: string; side: string; quantity: number; filled: number; orderType?: string | null; price: number | null; avgPrice: number | null; status: string; time: string | null };
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
    orderType: t(r, "order_type", "ordertype", "orderType", "OrderType"),
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


// INDstocks: GET endpoints from its official docs. Holdings and positions carry no live price or unrealised P&L, only quantities and averages.
const indGet = async (ctx: LiveCtx, path: string) => obj(await http(`${INDSTOCKS}${path}`, { headers: indstocksHeaders(ctx) })).data;
const indstocks: AccountReader = {
  async profile(ctx) {
    const d = obj(await indGet(ctx, "/user/profile"));
    return { name: [t(d, "first_name"), t(d, "last_name")].filter(Boolean).join(" ") || null, clientId: t(d, "user_id"), email: t(d, "email") };
  },
  async funds(ctx) {
    const d = obj(await indGet(ctx, "/funds"));
    const avl = obj(d.detailed_avl_balance);
    const lines = [...numericLines(d).filter((l) => !l.name.startsWith("detailed_avl_balance.")), ...numericLines(avl, "available.")];
    return { available: n(avl, "eq_cnc", "eq_mis"), used: null, total: n(d, "sod_balance"), lines };
  },
  holdings: async (ctx) =>
    rows(await indGet(ctx, "/portfolio/holdings")).map((r) => ({ symbol: t(r, "symbol") ?? "?", exchange: null, quantity: n(r, "total_qty") ?? 0, avgPrice: n(r, "avg_price"), ltp: null, pnl: null })),
  async positions(ctx) {
    const out: AccountPosition[] = [];
    for (const [segment, product] of [["equity", "intraday"], ["equity", "cnc"], ["derivative", "intraday"], ["derivative", "margin"]]) {
      const list = rows(await indGet(ctx, `/portfolio/positions?segment=${segment}&product=${product}`));
      out.push(...list.map((r) => ({ symbol: t(r, "symbol") ?? "?", exchange: t(r, "exchange"), product: t(r, "product"), quantity: n(r, "net_qty") ?? 0, avgPrice: n(r, "avg_price"), ltp: null, pnl: null, realised: n(r, "realized_profit") })));
    }
    return out;
  },
  orders: async (ctx) =>
    rows(await indGet(ctx, "/order-book")).map((r) => ({ id: t(r, "id") ?? "", symbol: t(r, "name") ?? "?", side: sideOf(r.txn_type), quantity: n(r, "requested_qty") ?? 0, filled: n(r, "traded_qty") ?? 0, orderType: t(r, "order_type"), price: n(r, "requested_price"), avgPrice: n(r, "traded_price"), status: t(r, "status") ?? "", time: null })),
  trades: async (ctx) =>
    rows(await indGet(ctx, "/trade-book?segment=EQUITY")).map((r) => ({ id: t(r, "fill_id") ?? "", orderId: t(r, "exch_order_id"), symbol: t(r, "scrip_code") ?? "?", side: "", quantity: n(r, "quantity") ?? 0, price: n(r, "price"), time: t(r, "trade_date") })),
};


// Motilal Oswal: POST endpoints from its docs. Motilal's field names for holdings, positions and funds aren't spelled out in
// the public docs, so each figure is read under every name it is likely to carry; anything missing shows as blank, never as a guess.
const moPost = async (ctx: LiveCtx, path: string) => {
  const b = obj(await http(`${MOTILAL}${path}`, { method: "POST", headers: motilalHeadersFor(ctx), json: {} }));
  return b.data;
};
const motilal: AccountReader = {
  async profile(ctx) {
    const d = obj(await moPost(ctx, "/rest/login/v5/getprofile"));
    return { name: t(d, "clientname", "name"), clientId: t(d, "clientcode"), email: t(d, "email", "emailid") };
  },
  async funds(ctx) {
    const raw = await moPost(ctx, "/rest/report/v3/getreportmarginsummary");
    const list = rows(raw);
    const lines = list.length ? list.flatMap((r) => (t(r, "particulars", "particular") && n(r, "amount") !== null ? [{ name: t(r, "particulars", "particular")!, value: n(r, "amount")! }] : numericLines(r))) : numericLines(obj(raw));
    return { available: null, used: null, total: null, lines };
  },
  holdings: async (ctx) =>
    rows(await moPost(ctx, "/rest/report/v3/getdpholding")).map((r) => ({ symbol: t(r, "scripname", "symbol", "scripshortname") ?? "?", exchange: t(r, "exchange"), quantity: n(r, "dpquantity", "quantity", "totalqty") ?? 0, avgPrice: n(r, "buyavgprice", "averageprice", "avgprice"), ltp: n(r, "ltp", "LTP", "scripltp"), pnl: null })),
  positions: async (ctx) =>
    rows(await moPost(ctx, "/rest/book/v4/getposition")).map((r) => {
      const buy = n(r, "buyquantity") ?? 0;
      const sell = n(r, "sellquantity") ?? 0;
      return { symbol: t(r, "symbol", "scripname") ?? "?", exchange: t(r, "exchange"), product: t(r, "productname", "producttype"), quantity: n(r, "netqty", "quantity") ?? buy - sell, avgPrice: n(r, "averageprice", "buyavgprice"), ltp: n(r, "ltp", "LTP"), pnl: n(r, "unrealizedpnl", "pnl"), realised: n(r, "bookedprofitloss", "realizedpnl") };
    }),
  orders: async (ctx) =>
    rows(await moPost(ctx, "/rest/book/v5/getorderbook")).map((r) => ({ id: t(r, "uniqueorderid") ?? "", symbol: t(r, "symbol") ?? "?", side: sideOf(r.buyorsell), quantity: n(r, "orderqty") ?? 0, filled: n(r, "totalqtytraded") ?? 0, orderType: t(r, "ordertype"), price: n(r, "price"), avgPrice: n(r, "averageprice"), status: t(r, "orderstatus") ?? "", time: t(r, "recordinserttime", "orderentrytime") })),
  trades: async (ctx) =>
    rows(await moPost(ctx, "/rest/book/v4/gettradebook")).map((r) => ({ id: t(r, "tradeno", "tradenumber", "uniquetradeid") ?? "", orderId: t(r, "uniqueorderid"), symbol: t(r, "symbol") ?? "?", side: sideOf(r.buyorsell), quantity: n(r, "tradeqty", "quantity") ?? 0, price: n(r, "tradeprice", "price"), time: t(r, "tradetime", "recordinserttime") })),
};


// HDFC Securities (HDFC Sky): GET endpoints from its docs. Orders are two lists (pending and completed); funds come as "description / value" rows.
const hdGet = async (ctx: LiveCtx, path: string, extra: Record<string, string> = {}) => obj(await http(`${HDFCSKY}${path}?${hdfcskyQuery(ctx, extra)}`, { headers: hdfcskyHeaders(ctx) }));
const hdfcsky: AccountReader = {
  async profile(ctx) {
    const d = obj((await hdGet(ctx, "/oapi/v1/user/trading_info")).data);
    return { name: t(d, "name"), clientId: t(d, "client_id"), email: null };
  },
  async funds(ctx) {
    const d = obj((await hdGet(ctx, "/oapi/v2/funds/view", { type: "all" })).data);
    const lines = rows(d.values).flatMap((r) => {
      const name = t(r, "0");
      const value = num(r["1"]);
      return name && value !== null ? [{ name, value }] : [];
    });
    const pick = (name: string) => lines.find((l) => l.name.toLowerCase() === name)?.value ?? null;
    return { available: pick("available margin"), used: pick("margin used"), total: pick("opening balance"), lines };
  },
  async holdings(ctx) {
    const d = obj((await hdGet(ctx, "/oapi/v1/holdings")).data);
    return rows(d.holdings).map((r) => ({ symbol: t(r, "symbol", "trading_symbol") ?? "?", exchange: t(r, "exchange"), quantity: n(r, "quantity") ?? 0, avgPrice: n(r, "buy_avg"), ltp: n(r, "ltp"), pnl: null }));
  },
  async positions(ctx) {
    return rows((await hdGet(ctx, "/oapi/v1/positions", { type: "historical" })).data).map((r) => ({ symbol: t(r, "trading_symbol", "symbol") ?? "?", exchange: t(r, "exchange"), product: t(r, "product"), quantity: n(r, "net_quantity") ?? 0, avgPrice: n(r, "average_price", "average_buy_price"), ltp: n(r, "ltp"), pnl: null, realised: n(r, "realized_mtm") }));
  },
  async orders(ctx) {
    const out: AccountOrder[] = [];
    for (const type of ["pending", "completed"]) {
      const d = obj((await hdGet(ctx, "/oapi/v1/orders", { type })).data);
      out.push(...rows(d.orders).map((r) => ({ id: t(r, "oms_order_id") ?? "", symbol: t(r, "trading_symbol") ?? "?", side: sideOf(r.order_side), quantity: n(r, "quantity") ?? 0, filled: n(r, "filled_quantity") ?? 0, orderType: t(r, "order_type"), price: n(r, "price"), avgPrice: n(r, "average_price"), status: t(r, "order_status") ?? "", time: t(r, "order_entry_time") })));
    }
    return out;
  },
  async trades(ctx) {
    const d = obj((await hdGet(ctx, "/oapi/v1/trades")).data);
    return rows(d.trades).map((r) => ({ id: t(r, "trade_number") ?? "", orderId: t(r, "oms_order_id"), symbol: t(r, "trading_symbol") ?? "?", side: sideOf(r.order_side), quantity: n(r, "trade_quantity") ?? 0, price: n(r, "trade_price"), time: t(r, "trade_time") }));
  },
};


// Paytm Money: GET endpoints from Paytm's official client library. Its public docs don't spell out the reply fields for holdings,
// positions and orders, so each figure is read under every name it is likely to carry and the list is found wherever it sits in the reply.
const pmGet = async (ctx: LiveCtx, path: string) => obj(await http(`${PAYTM}${path}`, { headers: paytmHeaders(ctx) }));
/** The first list of records inside a reply, wherever the broker put it (data, data.results, data.holdings …). */
function firstRows(v: unknown, depth = 0): Record<string, unknown>[] {
  if (Array.isArray(v)) return v.map(obj).filter((r) => Object.keys(r).length);
  if (v && typeof v === "object" && depth < 3) for (const x of Object.values(v as Record<string, unknown>)) { const r = firstRows(x, depth + 1); if (r.length) return r; }
  return [];
}
const paytmmoney: AccountReader = {
  async profile(ctx) {
    const d = obj((await pmGet(ctx, "/accounts/v1/user/details")).data);
    return { name: t(d, "name", "user_name"), clientId: t(d, "client_id", "pml_id"), email: t(d, "email") };
  },
  async funds(ctx) {
    const d = obj((await pmGet(ctx, "/accounts/v1/funds/summary?config=true")).data);
    const lines = numericLines(d);
    return { available: n(d, "funds_available", "available_cash", "available_balance"), used: n(d, "utilised_amount", "used_margin"), total: n(d, "funds_added", "total_balance"), lines };
  },
  holdings: async (ctx) =>
    firstRows((await pmGet(ctx, "/holdings/v1/get-user-holdings-data")).data).map((r) => ({ symbol: t(r, "nse_symbol", "symbol", "display_name", "name") ?? "?", exchange: t(r, "exchange"), quantity: n(r, "quantity", "remaining_quantity", "total_quantity") ?? 0, avgPrice: n(r, "cost_price", "average_price", "avg_price"), ltp: n(r, "last_traded_price", "ltp"), pnl: n(r, "pnl", "unrealised_pnl") })),
  positions: async (ctx) =>
    firstRows((await pmGet(ctx, "/orders/v1/position")).data).map((r) => ({ symbol: t(r, "display_name", "symbol", "name") ?? "?", exchange: t(r, "exchange"), product: t(r, "product"), quantity: n(r, "net_qty", "quantity", "net_quantity") ?? 0, avgPrice: n(r, "net_avg", "average_price", "avg_price"), ltp: n(r, "last_traded_price", "ltp"), pnl: n(r, "pnl", "unrealised_pnl"), realised: n(r, "realised_profit", "realized_pnl") })),
  orders: async (ctx) =>
    firstRows((await pmGet(ctx, "/orders/v1/order-book")).data).map((r) => ({ id: t(r, "order_no", "order_id") ?? "", symbol: t(r, "display_name", "symbol", "name") ?? "?", side: sideOf(r.txn_type), quantity: n(r, "quantity") ?? 0, filled: n(r, "traded_qty", "filled_quantity") ?? 0, orderType: t(r, "order_type"), price: n(r, "price"), avgPrice: n(r, "avg_traded_price", "average_price"), status: t(r, "status", "order_status") ?? "", time: t(r, "order_date_time", "order_time") })),
};


// Anand Rathi (XTS standard): GET endpoints on the server the login returned. Replies are { type, result }, with the lists under
// result (positions in result.positionList, holdings in result.RMSHoldings.Holdings, funds in result.BalanceList[0].limitObject).
const xGet = async (ctx: LiveCtx, path: string) => obj(await http(xtsUrl(ctx, path), { headers: xtsHeaders(ctx) })).result;
const anandrathi: AccountReader = {
  async profile(ctx) {
    const r = obj(await xGet(ctx, "/user/profile"));
    return { name: t(r, "ClientName", "clientName"), clientId: t(r, "ClientId", "clientId"), email: t(r, "EmailId", "email") };
  },
  async funds(ctx) {
    const first = obj(arr(obj(await xGet(ctx, "/user/balance")).BalanceList)[0]);
    const sub = obj(obj(first.limitObject).RMSSubLimits);
    return { available: n(sub, "netMarginAvailable", "cashAvailable"), used: n(sub, "marginUtilized", "utilizedMargin"), total: n(sub, "cashAvailable", "netMarginAvailable"), lines: numericLines(sub) };
  },
  async holdings(ctx) {
    const h = obj(obj(await xGet(ctx, "/portfolio/holdings")).RMSHoldings).Holdings;
    const list = Array.isArray(h) ? h.map(obj) : Object.values(obj(h)).map(obj);
    return list.map((r) => ({ symbol: t(r, "TradingSymbol", "tradingSymbol", "ISIN") ?? "?", exchange: t(r, "ExchangeNSEInstrumentId") ? "NSE" : null, quantity: n(r, "HoldingQuantity", "Quantity") ?? 0, avgPrice: n(r, "BuyAvgPrice", "AveragePrice"), ltp: null, pnl: null }));
  },
  async positions(ctx) {
    return rows(obj(await xGet(ctx, "/portfolio/positions?dayOrNet=NetWise")).positionList).map((r) => ({ symbol: t(r, "TradingSymbol") ?? "?", exchange: t(r, "ExchangeSegment"), product: t(r, "ProductType"), quantity: n(r, "Quantity") ?? 0, avgPrice: n(r, "BuyAveragePrice", "SellAveragePrice"), ltp: null, pnl: n(r, "UnrealizedMTM", "MTM"), realised: n(r, "RealizedMTM") }));
  },
  orders: async (ctx) =>
    rows(await xGet(ctx, "/orders")).map((r) => ({ id: t(r, "AppOrderID") ?? "", symbol: t(r, "TradingSymbol") ?? "?", side: sideOf(r.OrderSide), quantity: n(r, "OrderQuantity") ?? 0, filled: n(r, "CumulativeQuantity") ?? 0, orderType: t(r, "OrderType"), price: n(r, "OrderPrice"), avgPrice: n(r, "OrderAverageTradedPrice"), status: t(r, "OrderStatus") ?? "", time: t(r, "OrderGeneratedDateTime", "ExchangeTransactTime") })),
  trades: async (ctx) =>
    rows(await xGet(ctx, "/orders/trades")).map((r) => ({ id: t(r, "ExecutionID", "AppOrderID") ?? "", orderId: t(r, "AppOrderID"), symbol: t(r, "TradingSymbol") ?? "?", side: sideOf(r.OrderSide), quantity: n(r, "LastTradedQuantity", "OrderQuantity") ?? 0, price: n(r, "LastExecutionTransactTime") === null ? n(r, "OrderAverageTradedPrice", "LastTradedPrice") : null, time: t(r, "LastExecutionTransactTime", "ExchangeTransactTime") })),
};

export const ACCOUNT_READERS: Partial<Record<BrokerId, AccountReader>> = { anandrathi, paytmmoney, hdfcsky, motilal, indstocks, groww, zerodha, upstox, fyers, angelone, dhan, "5paisa": fivepaisa };
export const ACCOUNT_SECTIONS = ["profile", "funds", "holdings", "positions", "orders", "trades"] as const;
export type AccountSection = (typeof ACCOUNT_SECTIONS)[number];
