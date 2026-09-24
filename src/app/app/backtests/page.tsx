import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import BacktestRunForm from "@/components/backtest-run-form";
import EmptyState from "@/components/empty-state";
import { FlaskConical, History } from "lucide-react";
import { formatPct, toneOf, TONE_TEXT } from "@/lib/format";
import PageHeader from "@/components/ui/page-header";

export const metadata = { title: "Backtests", robots: { index: false } };

export default async function BacktestsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const [strategies, runs] = await Promise.all([
    prisma.strategy.findMany({
      // Deleted strategies never belong in a "pick one to run" list — that
      // would defeat the point of deleting one in the first place.
      where: { userId: session.user.id, status: { not: "DELETED" } },
      include: { instrument: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.backtestRun.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <div>
      <PageHeader title="Backtests" icon={FlaskConical} description={<>Simulate a strategy against real historical data — real trades, brokerage/slippage assumptions, and no look-ahead bias. Backtested performance does not guarantee future results.</>} />

      <div className="mt-6">
        <BacktestRunForm
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
            trailingSlEnabled: s.trailingSlEnabled,
            trailingSlUnit: s.trailingSlUnit,
            trailingSlValue: s.trailingSlValue,
            maxPyramidEntries: s.maxPyramidEntries,
          }))}
        />
      </div>

      {runs.length === 0 ? (
        <div className="mt-8">
          <EmptyState pose="thinking" title="No backtests run yet." description="Run one above against real historical data to see how a strategy would have performed." />
        </div>
      ) : (
        <section className="mt-8">
          <div className="mb-3 flex items-center gap-2">
            <History size={16} className="text-brand-primary" />
            <h2 className="text-sm font-semibold text-brand-navy">Past runs</h2>
            <span className="rounded-full bg-brand-navy/[0.06] px-2 py-0.5 text-xs font-semibold text-brand-navy/55">{runs.length}</span>
          </div>
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
        </section>
      )}
    </div>
  );
}
