import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logError, logWarn } from "@/lib/logger";
import { marketExtrasFor } from "@/lib/market-data";
import type { MarketExtras } from "@/lib/market-data/extras";
import { chooseExpiry, weekdayOf, type DayTrade } from "./backtest-engine";
import { simulateDate, type DayContext, type RunConfig } from "./backtest-runner";

// Options forward tests: hypothetical trades on live option prices, no orders.
// Each check re-simulates today from the day's minute candles up to now with
// exactly the backtest's rules — so a stop-loss hit at 11:02 is recorded at
// 11:02 even if the check runs at 11:05.

const IST = 5.5 * 3_600_000;
const istNow = () => {
  const d = new Date(Date.now() + IST);
  return { date: d.toISOString().slice(0, 10), minute: d.getUTCHours() * 60 + d.getUTCMinutes() };
};

/** Today's contracts from the live chain: upcoming expiries, with strikes for the one this strategy trades. */
async function liveContracts(extras: MarketExtras, cfg: RunConfig, date: string): Promise<DayContext | null> {
  const expiries = await extras.expiries(cfg.underlying, { includeToday: true });
  const expiry = chooseExpiry(date, expiries, cfg.expiryRule);
  if (!expiry) return null;
  const strikes = (await extras.optionChain(cfg.underlying, expiry)).map((r) => r.strike);
  return { contracts: new Map(expiries.map((e) => [e, e === expiry ? strikes : []])) };
}

/** Today's open position, plus the strikes listed for its expiry when it was opened (so later checks re-use the same contracts). */
export type ForwardOpen = DayTrade & { open: true; asOfMinute: number; strikes: number[] };

/** The contracts a stored position was opened with. */
const contractsOf = (p: ForwardOpen): DayContext => ({ contracts: new Map([[p.expiry, p.strikes]]) });

/** Brings one forward test up to date. Returns what changed (for logs/UI). */
export async function checkOptionForwardTest(id: string): Promise<"closed" | "open" | "idle"> {
  const test = await prisma.optionForwardTest.findUnique({ where: { id } });
  if (!test || test.status !== "ACTIVE") return "idle";
  const extras = marketExtrasFor(test.userId);
  if (!extras) return "idle"; // the account lost the licensed feed — nothing to do
  const cfg = test.config as unknown as RunConfig;
  const { date, minute } = istNow();
  const trades = test.trades as unknown as DayTrade[];
  const costs = { brokeragePerOrder: test.brokeragePerOrder, slippagePct: test.slippagePct };

  // A position from an earlier day that was never finalised (no check after its square-off): settle it at the square-off.
  const prev = test.today as unknown as ForwardOpen | null;
  if (prev && prev.date !== date) {
    const settled = await simulateDate(extras, cfg, prev.date, prev.strikes?.length ? contractsOf(prev) : { contracts: null }, costs).catch(() => null);
    if (settled) trades.push(settled);
    await prisma.optionForwardTest.update({ where: { id }, data: { trades: trades as unknown as Prisma.InputJsonValue, today: Prisma.DbNull, lastCheckedAt: new Date() } });
    return "closed";
  }

  const tradingToday = weekdayOf(date) <= 5 && cfg.weekdays.includes(weekdayOf(date));
  if (!tradingToday || minute <= cfg.entryMinute || trades.some((t) => t.date === date)) {
    await prisma.optionForwardTest.update({ where: { id }, data: { lastCheckedAt: new Date() } });
    return "idle";
  }

  // Once a position is open, keep its expiry and strikes — on expiry day the live list drops that expiry after 15:30.
  const ctx = prev?.strikes?.length ? contractsOf(prev) : await liveContracts(extras, cfg, date);
  if (!ctx?.contracts) return "idle";
  const finished = minute >= cfg.exitMinute;
  const t = await simulateDate(extras, { ...cfg, exitMinute: finished ? cfg.exitMinute : minute }, date, ctx, costs);
  if (!t) {
    logWarn("options.forward", "no entry price yet", { id, date });
    return "idle";
  }
  if (finished || t.exitReason !== "TIME") {
    trades.push(t);
    await prisma.optionForwardTest.update({ where: { id }, data: { trades: trades as unknown as Prisma.InputJsonValue, today: Prisma.DbNull, lastCheckedAt: new Date() } });
    return "closed";
  }
  const open: ForwardOpen = { ...t, open: true, asOfMinute: minute, strikes: ctx.contracts.get(t.expiry) ?? [] };
  await prisma.optionForwardTest.update({ where: { id }, data: { today: open as unknown as Prisma.InputJsonValue, lastCheckedAt: new Date() } });
  return "open";
}

/** One pass over every active options forward test (from the market-hours job). */
export async function runScheduledOptionForwardTests(budgetMs = 25_000) {
  const started = Date.now();
  const tests = await prisma.optionForwardTest.findMany({ where: { status: "ACTIVE" }, select: { id: true }, orderBy: { updatedAt: "asc" } });
  let checked = 0;
  let failed = 0;
  for (const t of tests) {
    if (Date.now() - started > budgetMs) break;
    try {
      await checkOptionForwardTest(t.id);
      checked++;
    } catch (err) {
      failed++;
      logError("options.forward.scheduled", err, { id: t.id });
    }
  }
  return { total: tests.length, checked, failed, ms: Date.now() - started };
}
