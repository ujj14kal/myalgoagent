import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logError, logWarn } from "@/lib/logger";
import type { MarketExtras } from "@/lib/market-data/extras";
import {
  chooseExpiry,
  istDateOf,
  optionSymbol,
  parseContracts,
  simulateDay,
  strikeAt,
  summarizeOptionBacktest,
  weekdayOf,
  istMinuteOf,
  type Contracts,
  type DayTrade,
  type OptionStrategyConfig,
} from "./backtest-engine";

// Runs an options backtest a chunk of trading days at a time, so each request
// stays well inside the hosting time limit; the page keeps calling until the
// run is done. Every finished day is saved as it goes.

/** Where the underlying's own price comes from (TrueData names). */
export const SPOT_NAME: Record<string, string> = { NIFTY: "NIFTY 50", BANKNIFTY: "NIFTY BANK" };
export const spotName = (underlying: string) => SPOT_NAME[underlying] ?? underlying;

export type RunConfig = OptionStrategyConfig & { lotSize: number };

const IST = 5.5 * 3600;
const dayStart = (date: string) => Date.parse(`${date}T00:00:00Z`) / 1000 - IST;

/** Trading days (yyyy-mm-dd) between two dates, from the underlying's daily candles. */
export async function tradingDays(extras: MarketExtras, underlying: string, from: string, to: string): Promise<string[]> {
  const out = new Set<string>();
  const end = dayStart(to) + 86399;
  // Daily candles come back ~3 years per request.
  for (let start = dayStart(from); start <= end; start += 1000 * 86400) {
    const bars = await extras.bars(spotName(underlying), start, Math.min(start + 1000 * 86400 - 1, end), "eod");
    for (const b of bars) out.add(istDateOf(b.time + 9 * 3600));
  }
  return [...out].filter((d) => d >= from && d <= to).sort();
}

export type DayContext = { contracts: Contracts | null };

/**
 * One trading day: find the expiry and strikes that were listed then, the
 * spot at the entry minute, each leg's minute candles — and simulate it.
 * Null when the day can't be traded (no contract listed, no price).
 */
export async function simulateDate(extras: MarketExtras, cfg: RunConfig, date: string, ctx: DayContext, costs: { brokeragePerOrder: number; slippagePct: number }): Promise<DayTrade | null> {
  // One contract list serves many days (it lists expiries weeks ahead); refetched when it doesn't cover this day.
  ctx.contracts ??= parseContracts(await extras.tradedFoSymbols(date), cfg.underlying);
  let expiry = chooseExpiry(date, [...ctx.contracts.keys()], cfg.expiryRule);
  if (!expiry || !ctx.contracts.has(expiry)) {
    ctx.contracts = parseContracts(await extras.tradedFoSymbols(date), cfg.underlying);
    expiry = chooseExpiry(date, [...ctx.contracts.keys()], cfg.expiryRule);
  }
  if (!expiry) return null;
  const open = dayStart(date) + 9 * 3600;
  const close = dayStart(date) + 16 * 3600;
  const spotBars = await extras.bars(spotName(cfg.underlying), open, close, "1min");
  const spotBar = spotBars.find((b) => istMinuteOf(b.time) >= cfg.entryMinute);
  if (!spotBar) return null;
  const strikes = ctx.contracts.get(expiry) ?? [];
  const picked = cfg.legs.map((leg) => ({ leg, at: strikeAt(strikes, spotBar.open, leg.offset) }));
  if (picked.some((p) => !p.at)) return null;
  const legs = await Promise.all(
    picked.map(async ({ leg, at }) => {
      const symbol = optionSymbol(cfg.underlying, expiry!, at!.strike, leg.type);
      return { leg, symbol, strike: at!.strike, bars: await extras.bars(symbol, open, close, "1min") };
    }),
  );
  return simulateDay({ date, expiry, spot: spotBar.open, atm: picked[0].at!.atm, legs }, cfg, costs, cfg.lotSize);
}

const DAYS_PER_CHUNK = 10;
const BUDGET_MS = 20_000;

/** Simulates the next chunk of days of a RUNNING run and saves the progress. */
export async function continueRun(runId: string, userId: string, extras: MarketExtras) {
  const run = await prisma.optionBacktestRun.findFirst({ where: { id: runId, userId } });
  if (!run) throw new Error("Backtest not found.");
  if (run.status !== "RUNNING" || !run.cursor) return run;
  const started = Date.now();
  const cfg = run.config as unknown as RunConfig;

  try {
    const days = (await tradingDays(extras, cfg.underlying, run.cursor, run.toDate)).slice(0, DAYS_PER_CHUNK);
    const trades = run.trades as unknown as DayTrade[];
    let done = 0;
    let skipped = 0;

    const ctx: DayContext = { contracts: null };
    for (const date of days) {
      if (Date.now() - started > BUDGET_MS) break;
      done++;
      if (!cfg.weekdays.includes(weekdayOf(date))) continue;
      const trade = await simulateDate(extras, cfg, date, ctx, { brokeragePerOrder: run.brokeragePerOrder, slippagePct: run.slippagePct });
      if (trade) trades.push(trade);
      else skipped++;
    }

    const processed = days.slice(0, done);
    const nextCursor = processed.length ? nextDay(processed.at(-1)!) : run.cursor;
    const finished = days.length === 0 || (done === days.length && days.length < DAYS_PER_CHUNK) || nextCursor > run.toDate;
    if (skipped) logWarn("options.backtest", "days skipped (no contract or price)", { runId, skipped });
    return prisma.optionBacktestRun.update({
      where: { id: run.id },
      data: {
        trades: trades as unknown as Prisma.InputJsonValue,
        daysDone: run.daysDone + done,
        cursor: finished ? null : nextCursor,
        status: finished ? "DONE" : "RUNNING",
        stats: finished ? (summarizeOptionBacktest(trades) as unknown as Prisma.InputJsonValue) : undefined,
      },
    });
  } catch (err) {
    logError("options.backtest", err, { runId });
    return prisma.optionBacktestRun.update({ where: { id: run.id }, data: { status: "FAILED", error: err instanceof Error ? err.message.slice(0, 300) : "Failed" } });
  }
}

function nextDay(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}
