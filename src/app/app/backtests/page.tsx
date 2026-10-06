import { parseTargets } from "@/lib/trading-engine/targets-config";
import { parseEntryPlan } from "@/lib/trading-engine/entry-plan-config";
import Pager from "@/components/ui/pager";
import { pageWindow, readPageQuery } from "@/lib/pagination";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { marketDataFor } from "@/lib/market-data";
import BacktestRunForm from "@/components/backtest-run-form";
import EmptyState from "@/components/empty-state";
import { FlaskConical, History } from "lucide-react";
import { formatPct, toneOf, TONE_TEXT } from "@/lib/format";
import PageHeader from "@/components/ui/page-header";
import type { Prisma } from "@prisma/client";
import ListToolbar from "@/components/ui/list-toolbar";
import { keepParams, qEnum, qText } from "@/lib/list-query";

const SORTS = ["new", "old", "best", "worst", "trades"] as const;
const ORDER: Record<(typeof SORTS)[number], Prisma.BacktestRunOrderByWithRelationInput> = {
  new: { createdAt: "desc" },
  old: { createdAt: "asc" },
  best: { totalReturnPct: "desc" },
  worst: { totalReturnPct: "asc" },
  trades: { tradeCount: "desc" },
};

export const metadata = { title: "Backtests", robots: { index: false } };

export default async function BacktestsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await auth();
  if (!session?.user?.id) return null;

  // Past runs are searched, filtered and paged in the database, not all loaded.
  const sp = await searchParams;
  const q = qText(sp.q);
  const result = qEnum(sp.result, ["all", "profit", "loss", "none"] as const, "all");
  const sort = qEnum(sp.sort, SORTS, "new");
  const where: Prisma.BacktestRunWhereInput = {
    userId: session.user.id,
    ...(q ? { OR: [{ strategyName: { contains: q, mode: "insensitive" } }, { instrumentSymbol: { contains: q, mode: "insensitive" } }] } : {}),
    ...(result === "profit" ? { totalReturnPct: { gt: 0 } } : result === "loss" ? { totalReturnPct: { lt: 0 } } : result === "none" ? { tradeCount: 0 } : {}),
  };
  const [allRuns, totalRuns] = await Promise.all([prisma.backtestRun.count({ where: { userId: session.user.id } }), prisma.backtestRun.count({ where })]);
  const { page, size } = readPageQuery(sp);
  const win = pageWindow(totalRuns, page, size);
  const params = keepParams({ q, result: result === "all" ? undefined : result, sort: sort === "new" ? undefined : sort, size: size === 25 ? undefined : String(size) });
  const [strategies, runs] = await Promise.all([
    prisma.strategy.findMany({
      // Deleted strategies never belong in a "pick one to run" list — that
      // would defeat the point of deleting one in the first place.
      where: { userId: session.user.id, status: { not: "DELETED" } },
      include: { instrument: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.backtestRun.findMany({
      where,
      orderBy: [ORDER[sort], { createdAt: "desc" }],
      skip: win.skip,
      take: win.take,
    }),
  ]);

  return (
    <div>
      <PageHeader title="Backtests" icon={FlaskConical} description={<>Simulate a strategy against real historical data — real trades, brokerage/slippage assumptions, and no look-ahead bias. Backtested performance does not guarantee future results.</>} />

      <div className="mt-6">
        <BacktestRunForm
          depth={marketDataFor(session.user.id, "backtest").depth}
          strategies={strategies.map((s) => ({
            id: s.id,
            name: s.name,
            instrumentSymbol: s.instrument.symbol,
            positionSizingMode: s.positionSizingMode,
            positionSizingValue: s.positionSizingValue,
            stopLossEnabled: s.stopLossEnabled,
            stopLossUnit: s.stopLossUnit,
            stopLossValue: s.stopLossValue,
            targetEnabled: s.targetEnabled,
            targetUnit: s.targetUnit,
            targetValue: s.targetValue,
            targets: parseTargets(s.targetsConfig),
            entryPlan: parseEntryPlan(s.entryPlan),
            trailingSlEnabled: s.trailingSlEnabled,
            trailingSlUnit: s.trailingSlUnit,
            trailingSlValue: s.trailingSlValue,
            maxPyramidEntries: s.maxPyramidEntries,
            timeframe: s.timeframe,
            noEntryAfterMinute: s.noEntryAfterMinute,
            squareOffMinute: s.squareOffMinute,
            productType: s.productType,
            orderType: s.orderType,
            limitMode: s.limitMode,
            limitValue: s.limitValue,
          }))}
        />
      </div>

      {allRuns === 0 ? (
        <div className="mt-8">
          <EmptyState pose="thinking" title="No backtests run yet." description="Run one above against real historical data to see how a strategy would have performed." />
        </div>
      ) : (
        <section className="mt-8">
          <div className="mb-3 flex items-center gap-2">
            <History size={16} className="text-brand-primary" />
            <h2 className="text-sm font-semibold text-brand-navy">Past runs</h2>
            <span className="rounded-full bg-brand-navy/[0.06] px-2 py-0.5 text-xs font-semibold text-brand-navy/55">{totalRuns}</span>
          </div>
          <div className="mb-4">
            <ListToolbar
              params={params}
              search={{ placeholder: "Search by strategy or stock…" }}
              selects={[
                { name: "result", label: "Result", options: [{ value: "all", label: "Any" }, { value: "profit", label: "Made money" }, { value: "loss", label: "Lost money" }, { value: "none", label: "No trades" }] },
                { name: "sort", label: "Sort", options: [{ value: "new", label: "Newest first" }, { value: "old", label: "Oldest first" }, { value: "best", label: "Best return" }, { value: "worst", label: "Worst return" }, { value: "trades", label: "Most trades" }] },
              ]}
            />
          </div>
          {runs.length === 0 && <p className="rounded-2xl border border-dashed border-black/10 px-4 py-8 text-center text-sm text-brand-navy/50">No backtests match these filters.</p>}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {runs.map((r) => {
              const tone = toneOf(r.totalReturnPct);
              return (
                <Link key={r.id} href={`/app/backtests/${r.id}`} className="surface surface-interactive block p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-brand-navy">{r.strategyName}</p>
                      <p className="mt-0.5 text-xs text-brand-navy/50">
                        {r.instrumentSymbol} · {r.range}
                      </p>
                    </div>
                    <p className={`num shrink-0 text-xl font-bold ${TONE_TEXT[tone]}`}>{formatPct(r.totalReturnPct)}</p>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 border-t border-black/[0.05] pt-3 text-xs">
                    <div>
                      <p className="text-brand-navy/40">Trades</p>
                      <p className="num font-semibold text-brand-navy">{r.tradeCount}</p>
                    </div>
                    <div>
                      <p className="text-brand-navy/40">Win rate</p>
                      <p className="num font-semibold text-brand-navy">{r.winRatePct.toFixed(0)}%</p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
          <Pager basePath="/app/backtests" params={params} window={win} />
        </section>
      )}
    </div>
  );
}
