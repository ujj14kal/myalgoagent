"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { logError } from "@/lib/logger";
import { marketExtrasFor } from "@/lib/market-data";
import { continueRun, tradingDays, type RunConfig } from "@/lib/options/backtest-runner";
import type { ExpiryRule, RiskUnit, StrategyLeg } from "@/lib/options/backtest-engine";

// Options strategies (multi-leg, ATM-relative) and their backtests on real
// option prices. Results are returned, not thrown, so messages survive production builds.

export type OptResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

export type OptionStrategyInput = {
  id?: string;
  name: string;
  underlying: string;
  legs: StrategyLeg[];
  expiryRule: ExpiryRule;
  entryMinute: number;
  exitMinute: number;
  weekdays: number[];
  stopLossUnit: RiskUnit | null;
  stopLossValue: number | null;
  targetUnit: RiskUnit | null;
  targetValue: number | null;
};

const RULES: ExpiryRule[] = ["WEEKLY_CURRENT", "WEEKLY_NEXT", "MONTHLY"];
const UNITS: RiskUnit[] = ["RUPEES", "PREMIUM_PCT"];
const OPEN = 9 * 60 + 15;
const CLOSE = 15 * 60 + 30;

function validate(i: OptionStrategyInput): string | null {
  if (!i.name?.trim() || i.name.trim().length > 80) return "Give the strategy a name (up to 80 characters).";
  if (!/^[A-Z0-9&-]{2,20}$/.test(i.underlying)) return "Pick an underlying, e.g. NIFTY, BANKNIFTY or a stock symbol.";
  if (!Array.isArray(i.legs) || i.legs.length < 1 || i.legs.length > 6) return "A strategy needs 1 to 6 legs.";
  for (const l of i.legs) {
    if (!["CE", "PE"].includes(l.type) || !["BUY", "SELL"].includes(l.side)) return "Each leg needs a call/put and buy/sell.";
    if (!Number.isInteger(l.offset) || Math.abs(l.offset) > 20) return "Strike offsets must be whole numbers of strikes, within 20 of ATM.";
    if (!Number.isInteger(l.lots) || l.lots < 1 || l.lots > 50) return "Lots must be between 1 and 50.";
  }
  if (!RULES.includes(i.expiryRule)) return "Pick an expiry.";
  if (!Number.isInteger(i.entryMinute) || !Number.isInteger(i.exitMinute) || i.entryMinute < OPEN || i.exitMinute > CLOSE || i.exitMinute <= i.entryMinute)
    return "Entry must be after 09:15 and the exit after the entry, by 15:30.";
  if (!i.weekdays?.length || i.weekdays.some((d) => !Number.isInteger(d) || d < 1 || d > 5)) return "Pick at least one weekday.";
  for (const [unit, value] of [
    [i.stopLossUnit, i.stopLossValue],
    [i.targetUnit, i.targetValue],
  ] as const) {
    if (unit && (!UNITS.includes(unit) || !(value && value > 0))) return "Stop-loss and target need a positive amount.";
  }
  return null;
}

async function userId() {
  return (await auth())?.user?.id ?? null;
}

export async function saveOptionStrategy(input: OptionStrategyInput): Promise<OptResult<{ id: string }>> {
  const uid = await userId();
  if (!uid) return { ok: false, error: "Sign in again." };
  const clean: OptionStrategyInput = { ...input, name: input.name?.trim(), underlying: input.underlying?.trim().toUpperCase() };
  const err = validate(clean);
  if (err) return { ok: false, error: err };
  const data = {
    name: clean.name,
    underlying: clean.underlying,
    legs: clean.legs.map(({ type, side, offset, lots }) => ({ type, side, offset, lots })) as unknown as Prisma.InputJsonValue,
    expiryRule: clean.expiryRule,
    entryMinute: clean.entryMinute,
    exitMinute: clean.exitMinute,
    weekdays: [...new Set(clean.weekdays)].sort(),
    stopLossUnit: clean.stopLossUnit,
    stopLossValue: clean.stopLossUnit ? clean.stopLossValue : null,
    targetUnit: clean.targetUnit,
    targetValue: clean.targetUnit ? clean.targetValue : null,
  };
  if (clean.id) {
    const found = await prisma.optionStrategy.findFirst({ where: { id: clean.id, userId: uid }, select: { id: true } });
    if (!found) return { ok: false, error: "Strategy not found." };
    await prisma.optionStrategy.update({ where: { id: found.id }, data });
    revalidatePath("/app/options/strategies");
    return { ok: true, data: { id: found.id } };
  }
  if ((await prisma.optionStrategy.count({ where: { userId: uid } })) >= 50) return { ok: false, error: "You can keep up to 50 options strategies." };
  const created = await prisma.optionStrategy.create({ data: { ...data, userId: uid } });
  revalidatePath("/app/options/strategies");
  return { ok: true, data: { id: created.id } };
}

export async function deleteOptionStrategy(id: string): Promise<OptResult> {
  const uid = await userId();
  if (!uid) return { ok: false, error: "Sign in again." };
  await prisma.optionStrategy.deleteMany({ where: { id, userId: uid } });
  revalidatePath("/app/options/strategies");
  return { ok: true };
}

export async function startOptionBacktest(input: { strategyId: string; fromDate: string; toDate: string; brokeragePerOrder: number; slippagePct: number }): Promise<OptResult<{ runId: string }>> {
  const uid = await userId();
  if (!uid) return { ok: false, error: "Sign in again." };
  const extras = marketExtrasFor(uid);
  if (!extras) return { ok: false, error: "Options backtests need the live market-data feed, which isn't enabled for your account yet." };
  if (await checkRateLimit(`opt-backtest:${uid}`, 10, 10 * 60_000)) return { ok: false, error: "Too many backtests started — wait a few minutes." };
  const strategy = await prisma.optionStrategy.findFirst({ where: { id: input.strategyId, userId: uid } });
  if (!strategy) return { ok: false, error: "Strategy not found." };
  const re = /^\d{4}-\d{2}-\d{2}$/;
  const today = new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
  if (!re.test(input.fromDate) || !re.test(input.toDate) || input.fromDate > input.toDate) return { ok: false, error: "Pick a valid date range." };
  if (input.toDate > today) return { ok: false, error: "The range can't end in the future." };
  if (Date.parse(input.toDate) - Date.parse(input.fromDate) > 2 * 366 * 86_400_000) return { ok: false, error: "Backtest up to 2 years at a time." };
  if (input.fromDate < "2020-01-01") return { ok: false, error: "Option prices go back to 2020." };
  if (!(input.brokeragePerOrder >= 0 && input.brokeragePerOrder <= 500) || !(input.slippagePct >= 0 && input.slippagePct <= 10)) return { ok: false, error: "Check the brokerage and slippage." };

  try {
    const [days, lotSize] = await Promise.all([tradingDays(extras, strategy.underlying, input.fromDate, input.toDate), extras.lotSize(strategy.underlying)]);
    if (!days.length) return { ok: false, error: "No trading days in that range." };
    if (!lotSize) return { ok: false, error: `${strategy.underlying} has no options listed on NSE.` };
    const config: RunConfig = {
      underlying: strategy.underlying,
      legs: strategy.legs as unknown as StrategyLeg[],
      expiryRule: strategy.expiryRule as ExpiryRule,
      entryMinute: strategy.entryMinute,
      exitMinute: strategy.exitMinute,
      weekdays: strategy.weekdays,
      stopLossUnit: strategy.stopLossUnit as RiskUnit | null,
      stopLossValue: strategy.stopLossValue,
      targetUnit: strategy.targetUnit as RiskUnit | null,
      targetValue: strategy.targetValue,
      lotSize,
    };
    const run = await prisma.optionBacktestRun.create({
      data: {
        userId: uid,
        strategyId: strategy.id,
        strategyName: strategy.name,
        config: config as unknown as Prisma.InputJsonValue,
        fromDate: input.fromDate,
        toDate: input.toDate,
        brokeragePerOrder: input.brokeragePerOrder,
        slippagePct: input.slippagePct,
        cursor: days[0],
        daysTotal: days.length,
      },
    });
    revalidatePath("/app/options/strategies");
    return { ok: true, data: { runId: run.id } };
  } catch (err) {
    logError("options.backtest.start", err);
    return { ok: false, error: "Couldn't start the backtest — the data feed didn't answer. Try again." };
  }
}

export type RunProgress = { status: string; daysDone: number; daysTotal: number; error: string | null };

export async function continueOptionBacktest(runId: string): Promise<OptResult<RunProgress>> {
  const uid = await userId();
  if (!uid) return { ok: false, error: "Sign in again." };
  const extras = marketExtrasFor(uid);
  if (!extras) return { ok: false, error: "The live market-data feed isn't enabled for your account." };
  const run = await continueRun(runId, uid, extras).catch((err) => {
    logError("options.backtest.continue", err, { runId });
    return null;
  });
  if (!run) return { ok: false, error: "Backtest not found." };
  if (run.status !== "RUNNING") revalidatePath(`/app/options/backtests/${run.id}`);
  return { ok: true, data: { status: run.status, daysDone: run.daysDone, daysTotal: run.daysTotal, error: run.error } };
}

export async function deleteOptionBacktest(runId: string): Promise<OptResult> {
  const uid = await userId();
  if (!uid) return { ok: false, error: "Sign in again." };
  await prisma.optionBacktestRun.deleteMany({ where: { id: runId, userId: uid } });
  revalidatePath("/app/options/strategies");
  return { ok: true };
}
