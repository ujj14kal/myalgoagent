import "server-only";
import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/logger";
import { marketDataFor } from "@/lib/market-data";
import { inMarketWindowFor } from "@/lib/paper/market-window";
import { emailEvent } from "@/lib/event-email";
import { describeAlert, isTriggered, type AlertDirection } from "./price-alerts";

// One pass over every active price alert (the always-on engine runs it every minute): the latest price of each instrument that
// is trading right now is fetched once, and every alert it has crossed fires exactly once.

const MAX_SYMBOLS = 60;

/** The latest traded price of one instrument, or null when it can't be read. */
export async function latestPrice(userId: string, symbol: string): Promise<number | null> {
  try {
    const data = marketDataFor(userId, "view");
    const minute = await data.getHistoricalCandles(symbol, "1d", "1m").catch(() => []);
    const last = minute.at(-1)?.close;
    if (last !== undefined && Number.isFinite(last)) return last;
    const daily = await data.getHistoricalCandles(symbol, "5d", "1d");
    return daily.at(-1)?.close ?? null;
  } catch {
    return null;
  }
}

export async function runPriceAlerts(now = new Date(), budgetMs = 30_000): Promise<{ symbols: number; fired: number; failed: number }> {
  const started = Date.now();
  const alerts = await prisma.priceAlert.findMany({ where: { status: "ACTIVE" }, orderBy: { createdAt: "asc" }, take: 2000 });
  const bySymbol = new Map<string, typeof alerts>();
  for (const a of alerts) {
    if (!inMarketWindowFor(a.symbol, now)) continue; // an NSE stock is only checked while it trades
    bySymbol.set(a.symbol, [...(bySymbol.get(a.symbol) ?? []), a]);
  }
  let fired = 0;
  let failed = 0;
  let n = 0;
  for (const [symbol, list] of bySymbol) {
    if (++n > MAX_SYMBOLS || Date.now() - started > budgetMs) break;
    const price = await latestPrice(list[0].userId, symbol);
    if (price === null) {
      failed++;
      continue;
    }
    for (const a of list) {
      if (!isTriggered(a.direction as AlertDirection, a.price, price)) continue;
      // Only the pass that wins this update sends the message, so a slow pass or two engines never alert twice.
      const won = await prisma.priceAlert.updateMany({ where: { id: a.id, status: "ACTIVE" }, data: { status: "TRIGGERED", triggeredAt: now, triggeredPrice: price } });
      if (won.count !== 1) continue;
      fired++;
      const what = describeAlert({ symbol: a.symbol, direction: a.direction as AlertDirection, price: a.price });
      const message = `Price alert: ${what}. Last price ₹${price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}.${a.note ? ` Your note: ${a.note}` : ""}`;
      await prisma.notification.create({ data: { userId: a.userId, type: "SIGNAL_ALERT", message, link: "/app/alerts" } }).catch((err) => logError("price-alert.notify", err));
      await emailEvent(a.userId, "price_alert", { subject: `Price alert: ${a.symbol.replace(/\.NS$/, "")}`, headline: "A price alert fired", body: message, path: "/app/alerts", linkLabel: "Open your alerts" });
    }
  }
  return { symbols: bySymbol.size, fired, failed };
}
