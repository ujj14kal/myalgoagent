import "server-only";
import { prisma } from "@/lib/prisma";
import { brokerById, type BrokerId } from "./catalog";
import { DATA_PLAN_HINT, dataAccess } from "./data-access";

// A short, honest note for the backtest screen: when none of the user's brokers is supplying market data, say
// that results use the general feed (shorter intraday history) and what to switch on at their broker for
// longer history and more accurate prices. Nothing is shown to a user whose broker already supplies data.

export type DataNotice = { text: string; hints: { broker: string; hint: string }[] } | null;

export async function backtestDataNotice(userId: string): Promise<DataNotice> {
  const conns = await prisma.brokerConnection.findMany({ where: { userId }, select: { broker: true } });
  if (!conns.length) {
    return { text: "Backtests use the general market feed, which keeps limited history for short timeframes. For longer history and more accurate prices, connect your broker and switch on its market-data API.", hints: [] };
  }
  const timeout = <T,>(p: Promise<T>) => Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), 4_000))]);
  const results = await Promise.all(conns.map(async (c) => ({ broker: c.broker as BrokerId, access: await timeout(dataAccess(userId, c.broker as BrokerId)).catch(() => null) })));
  if (results.some((r) => r.access?.status === "available")) return null;
  const needing = results.filter((r) => r.access?.status === "no_plan" || r.access?.status === "logged_out");
  if (!needing.length) return null; // nothing to ask of them: unsupported brokers, or checks that couldn't finish
  return {
    text: "For more accurate results and longer history, switch on your broker's market-data API. Until then, backtests use the general feed.",
    hints: needing.map((r) => ({ broker: brokerById(r.broker)?.name ?? r.broker, hint: r.access?.status === "logged_out" ? `Log in to ${brokerById(r.broker)?.name ?? r.broker} for today, then run again.` : (DATA_PLAN_HINT[r.broker] ?? r.access?.detail ?? "") })),
  };
}
