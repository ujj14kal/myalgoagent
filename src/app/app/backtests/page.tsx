import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import BacktestRunForm from "@/components/backtest-run-form";

export const metadata = { title: "Backtests", robots: { index: false } };

export default async function BacktestsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const [strategies, runs] = await Promise.all([
    prisma.strategy.findMany({
      where: { userId: session.user.id },
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
      <h1 className="text-2xl font-bold text-brand-navy">Backtests</h1>
      <p className="mt-2 text-sm text-brand-navy/60">
        Simulate a strategy against real historical data — real trades,
        brokerage/slippage assumptions, and no look-ahead bias. Backtested
        performance does not guarantee future results.
      </p>

      <div className="mt-6">
        <BacktestRunForm
          strategies={strategies.map((s) => ({ id: s.id, name: s.name, instrumentSymbol: s.instrument.symbol }))}
        />
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {runs.map((r) => (
          <Link
            key={r.id}
            href={`/app/backtests/${r.id}`}
            className="rounded-2xl border border-black/5 bg-white p-5 hover:border-brand-primary"
          >
            <p className="text-sm font-semibold text-brand-navy">{r.strategyName}</p>
            <p className="mt-1 text-xs text-brand-navy/60">
              {r.instrumentSymbol} · {r.range}
            </p>
            <p className={`mt-3 text-xl font-bold ${r.totalReturnPct >= 0 ? "text-brand-buy" : "text-brand-sell"}`}>
              {r.totalReturnPct >= 0 ? "+" : ""}
              {r.totalReturnPct.toFixed(2)}%
            </p>
            <p className="mt-1 text-xs text-brand-navy/40">
              {r.tradeCount} trades · {r.winRatePct.toFixed(0)}% win rate
            </p>
          </Link>
        ))}

        {runs.length === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed border-brand-navy/15 p-10 text-center">
            <p className="text-sm text-brand-navy/50">No backtests run yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
