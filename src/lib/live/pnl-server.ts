import "server-only";
import { prisma } from "@/lib/prisma";
import { userMarketDataReady } from "@/lib/market-data/for-user";
import { fifoPnl, type Fill } from "./pnl";
import { istToday } from "./order-ledger";

// What the dashboard's live P&L card shows: each live strategy's profit and loss today, from its own
// filled orders (realised) and its open position at the latest price (unrealised). Real orders only —
// forward tests never appear here.

export type LiveStrategyPnl = {
  id: string;
  name: string;
  symbol: string;
  status: string;
  openQty: number;
  openAvg: number | null;
  last: number | null;
  realised: number;
  unrealised: number | null;
  /** realised + unrealised today. */
  total: number;
};
export type LivePnl = { at: number; rows: LiveStrategyPnl[]; total: number; realised: number; unrealised: number; priced: boolean };

async function lastPrice(userId: string, symbol: string): Promise<number | null> {
  try {
    const market = await userMarketDataReady(userId, "view");
    const tick = await market.getRecentTicks?.(symbol, 1).catch(() => []);
    if (tick?.length) return tick[tick.length - 1].price;
    const candles = await market.getHistoricalCandles(symbol, "1d", "1m");
    if (candles.length) return candles[candles.length - 1].close;
    const daily = await market.getHistoricalCandles(symbol, "5d", "1d");
    return daily.length ? daily[daily.length - 1].close : null;
  } catch {
    return null;
  }
}

export async function liveDashboardPnl(userId: string): Promise<LivePnl> {
  const since = istToday().getTime();
  const deployments = await prisma.liveDeployment.findMany({
    where: { userId, OR: [{ status: { in: ["ACTIVE", "PAUSED"] } }, { orders: { some: { createdAt: { gte: istToday() }, filledQuantity: { gt: 0 } } } }] },
    select: { id: true, strategyName: true, instrumentSymbol: true, status: true },
    orderBy: { startedAt: "desc" },
    take: 20,
  });
  if (!deployments.length) return { at: Date.now(), rows: [], total: 0, realised: 0, unrealised: 0, priced: true };
  const orders = await prisma.liveOrder.findMany({
    where: { userId, deploymentId: { in: deployments.map((d) => d.id) }, filledQuantity: { gt: 0 } },
    select: { deploymentId: true, side: true, filledQuantity: true, averagePrice: true, price: true, createdAt: true, closedAt: true },
    orderBy: { createdAt: "asc" },
    take: 3000,
  });
  const symbols = [...new Set(deployments.map((d) => d.instrumentSymbol))];
  const prices = new Map(await Promise.all(symbols.map(async (s) => [s, await lastPrice(userId, s)] as const)));
  let priced = true;
  const rows = deployments.map((d): LiveStrategyPnl => {
    const fills: Fill[] = orders
      .filter((o) => o.deploymentId === d.id && (o.averagePrice ?? o.price))
      .map((o) => ({ side: o.side as "BUY" | "SELL", quantity: o.filledQuantity, price: (o.averagePrice ?? o.price)!, at: (o.closedAt ?? o.createdAt).getTime() }));
    const last = prices.get(d.instrumentSymbol) ?? null;
    const r = fifoPnl(fills, last, since);
    if (r.openQty !== 0 && last == null) priced = false;
    return {
      id: d.id,
      name: d.strategyName,
      symbol: d.instrumentSymbol.replace(/\.NS$/, ""),
      status: d.status,
      openQty: r.openQty,
      openAvg: r.openAvg,
      last,
      realised: r.realisedSince,
      unrealised: r.unrealised,
      total: Math.round((r.realisedSince + (r.unrealised ?? 0)) * 100) / 100,
    };
  });
  const realised = rows.reduce((s, r) => s + r.realised, 0);
  const unrealised = rows.reduce((s, r) => s + (r.unrealised ?? 0), 0);
  return { at: Date.now(), rows, total: Math.round((realised + unrealised) * 100) / 100, realised: Math.round(realised * 100) / 100, unrealised: Math.round(unrealised * 100) / 100, priced };
}
