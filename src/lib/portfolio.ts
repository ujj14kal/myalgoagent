import { prisma } from "@/lib/prisma";
import { marketDataProvider } from "@/lib/market-data";
import type { PaperSession } from "@prisma/client";

export type PaperSessionRow = {
  session: PaperSession;
  /** Current market value of the open position (always positive — used for exposure). */
  positionValue: number;
  /** Cash not tied up in the open position, so availableCash + position = equity. */
  availableCash: number;
  equity: number;
  pnl: number;
  pnlPct: number;
};

export async function getPaperSessionRows(userId: string): Promise<PaperSessionRow[]> {
  const sessions = await prisma.paperSession.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

  return Promise.all(
    sessions.map(async (s) => {
      // `cash` is never debited when a position opens — it only moves on
      // realized P&L at close (see the paper trading engine). So equity is
      // cash + UNREALIZED gain, not cash + the position's full market value;
      // adding the whole value double-counted the entry cost as profit and
      // showed e.g. +97% on a position that was actually down ~1%. Same
      // formula as the paper-trading list and the risk kill-switch check.
      let positionValue = 0;
      let unrealizedGain = 0;
      let availableCash = s.cash;
      if (s.positionQuantity !== null && s.positionEntryPrice !== null) {
        let latestClose = s.positionEntryPrice;
        try {
          const candles = await marketDataProvider.getHistoricalCandles(s.instrumentSymbol, "1mo", "1d");
          if (candles.length > 0) latestClose = candles.at(-1)!.close;
        } catch {
          // fall back to entry price (zero unrealized gain) if the quote can't be fetched
        }
        const qty = s.positionQuantity;
        const isShort = s.direction === "SHORT";
        positionValue = latestClose * qty;
        unrealizedGain = (isShort ? s.positionEntryPrice - latestClose : latestClose - s.positionEntryPrice) * qty;
        // A long ties up its cost; a short has received its sale proceeds.
        availableCash = isShort ? s.cash + s.positionEntryPrice * qty : s.cash - s.positionEntryPrice * qty;
      }
      const equity = s.cash + unrealizedGain;
      const pnl = equity - s.startingCapital;
      const pnlPct = s.startingCapital > 0 ? (pnl / s.startingCapital) * 100 : 0;
      return { session: s, positionValue, availableCash, equity, pnl, pnlPct };
    }),
  );
}

export function summarizePortfolio(rows: PaperSessionRow[]) {
  const totalCash = rows.reduce((sum, r) => sum + r.availableCash, 0);
  const totalPositionValue = rows.reduce((sum, r) => sum + r.positionValue, 0);
  const totalEquity = rows.reduce((sum, r) => sum + r.equity, 0);
  const totalStarting = rows.reduce((sum, r) => sum + r.session.startingCapital, 0);
  const totalPnl = totalEquity - totalStarting;
  const totalPnlPct = totalStarting > 0 ? (totalPnl / totalStarting) * 100 : 0;
  return { totalCash, totalPositionValue, totalEquity, totalStarting, totalPnl, totalPnlPct };
}

/** Cumulative equity curve built from chronological paper-order fills across all of a user's sessions. */
export async function getEquityCurve(userId: string, startingCapital: number) {
  const orders = await prisma.paperOrder.findMany({
    where: { paperSession: { userId } },
    orderBy: { time: "asc" },
    select: { time: true, netPnl: true },
  });

  let running = startingCapital;
  const points = orders
    .filter((o) => o.netPnl !== null)
    .map((o) => {
      running += o.netPnl ?? 0;
      return { time: o.time, equity: running };
    });

  // Always show at least a flat starting point so a brand-new account
  // still renders a (empty) chart shape instead of nothing.
  if (points.length === 0) {
    const now = Math.floor(Date.now() / 1000);
    return [{ time: now - 86400, equity: startingCapital }, { time: now, equity: startingCapital }];
  }
  return points;
}

export type PeriodPnl = { today: number; week: number; month: number; allTime: number };

export async function getPnlByPeriod(userId: string): Promise<PeriodPnl> {
  const orders = await prisma.paperOrder.findMany({
    where: { paperSession: { userId }, netPnl: { not: null } },
    select: { time: true, netPnl: true },
  });

  const now = Date.now() / 1000;
  const DAY = 86400;
  let today = 0;
  let week = 0;
  let month = 0;
  let allTime = 0;

  for (const o of orders) {
    const pnl = o.netPnl ?? 0;
    allTime += pnl;
    const age = now - o.time;
    if (age <= DAY) today += pnl;
    if (age <= 7 * DAY) week += pnl;
    if (age <= 30 * DAY) month += pnl;
  }

  return { today, week, month, allTime };
}

export async function getRecentActivity(userId: string, limit = 8) {
  const [orders, riskEvents] = await Promise.all([
    prisma.paperOrder.findMany({
      where: { paperSession: { userId } },
      include: { paperSession: { select: { strategyName: true, instrumentSymbol: true, id: true } } },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    prisma.riskEvent.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
  ]);

  type ActivityItem = { id: string; kind: "order" | "risk"; label: string; detail: string; at: Date; tone: "buy" | "sell" | "warn" };

  const items: ActivityItem[] = [
    ...orders.map((o) => ({
      id: o.id,
      kind: "order" as const,
      label: `${o.side} ${o.paperSession.instrumentSymbol}`,
      detail: `${o.paperSession.strategyName} · ₹${o.price.toFixed(2)} × ${o.quantity}`,
      at: o.createdAt,
      tone: o.side === "BUY" ? ("buy" as const) : ("sell" as const),
    })),
    ...riskEvents.map((e) => ({
      id: e.id,
      kind: "risk" as const,
      label: "Risk event",
      detail: e.message,
      at: e.createdAt,
      tone: "warn" as const,
    })),
  ];

  return items.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, limit);
}

export type StrategyPerformance = {
  id: string;
  name: string;
  status: string;
  instrumentSymbol: string;
  todayPnl: number;
  sparkline: number[];
};

export async function getStrategyPerformance(userId: string, limit = 6): Promise<StrategyPerformance[]> {
  const strategies = await prisma.strategy.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    take: limit,
    include: {
      instrument: { select: { symbol: true } },
      paperSessions: { include: { orders: { orderBy: { time: "asc" }, select: { time: true, netPnl: true } } } },
    },
  });

  const now = Date.now() / 1000;
  const DAY = 86400;

  return strategies.map((s) => {
    const orders = s.paperSessions.flatMap((ps) => ps.orders).filter((o) => o.netPnl !== null);
    const todayPnl = orders.filter((o) => now - o.time <= DAY).reduce((sum, o) => sum + (o.netPnl ?? 0), 0);

    let running = 0;
    const sparkline = orders.slice(-20).map((o) => (running += o.netPnl ?? 0));

    return {
      id: s.id,
      name: s.name,
      status: s.status,
      instrumentSymbol: s.instrument.symbol,
      todayPnl,
      sparkline,
    };
  });
}

export type RecentBacktestRow = {
  id: string;
  strategyName: string;
  instrumentSymbol: string;
  range: string;
  totalReturnPct: number;
  createdAt: Date;
};

export async function getRecentBacktests(userId: string, limit = 5): Promise<RecentBacktestRow[]> {
  const runs = await prisma.backtestRun.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      strategyName: true,
      instrumentSymbol: true,
      range: true,
      totalReturnPct: true,
      createdAt: true,
    },
  });
  return runs;
}
