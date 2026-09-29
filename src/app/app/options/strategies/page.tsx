import Link from "next/link";
import { Sigma } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/ui/page-header";
import OptionsTabs from "@/components/options/options-tabs";
import StrategyList from "@/components/options/strategy-list";
import { marketExtrasFor } from "@/lib/market-data";
import type { OptionStrategyInput } from "@/lib/option-strategy-actions";
import { formatSignedINR, toneOf, TONE_TEXT } from "@/lib/format";

export const metadata = {
  title: "Options Strategies",
  robots: { index: false },
};
export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  const live = !!marketExtrasFor(userId);
  const [strategies, runs, forwards] = await Promise.all([
    prisma.optionStrategy.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.optionBacktestRun.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        strategyName: true,
        fromDate: true,
        toDate: true,
        status: true,
        stats: true,
        daysDone: true,
        daysTotal: true,
      },
    }),
    prisma.optionForwardTest.findMany({
      where: { userId },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 20,
      select: {
        id: true,
        strategyName: true,
        status: true,
        trades: true,
        today: true,
        createdAt: true,
      },
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="Options Lab"
        icon={Sigma}
        description="Multi-leg options strategies defined around the at-the-money strike — backtested day by day on real historical option prices, with combined stop-loss and target."
      />
      <OptionsTabs active="/app/options/strategies" />
      {!live ? (
        <p className="surface mt-6 p-6 text-center text-sm text-brand-navy/60">
          Options backtests run on real historical option prices from the live market-data feed, which isn&apos;t enabled for your account yet.
        </p>
      ) : (
        <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_22rem]">
          <StrategyList
            strategies={strategies.map((s) => ({
              id: s.id,
              name: s.name,
              underlying: s.underlying,
              legs: s.legs as unknown as OptionStrategyInput["legs"],
              expiryRule: s.expiryRule as OptionStrategyInput["expiryRule"],
              entryMinute: s.entryMinute,
              exitMinute: s.exitMinute,
              weekdays: s.weekdays,
              stopLossUnit: s.stopLossUnit as OptionStrategyInput["stopLossUnit"],
              stopLossValue: s.stopLossValue,
              targetUnit: s.targetUnit as OptionStrategyInput["targetUnit"],
              targetValue: s.targetValue,
            }))}
          />
          <div className="space-y-4">
            <section className="surface h-fit overflow-hidden">
              <p className="border-b border-black/[0.05] px-4 py-3 text-sm font-semibold text-brand-navy">Forward tests</p>
              {forwards.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-brand-navy/45">None yet — press “Forward test” on a strategy.</p>
              ) : (
                <ul className="divide-y divide-black/[0.04]">
                  {forwards.map((f) => {
                    const closed = (f.trades as { netPnl: number }[]).reduce((sum, t) => sum + t.netPnl, 0);
                    const open = (f.today as { netPnl?: number } | null)?.netPnl ?? 0;
                    const total = closed + open;
                    return (
                      <li key={f.id}>
                        <Link href={`/app/options/forward/${f.id}`} className="block px-4 py-2.5 hover:bg-brand-bg/60">
                          <p className="flex items-center gap-2 text-sm font-semibold text-brand-navy">
                            {f.status === "ACTIVE" && <span className="h-1.5 w-1.5 rounded-full bg-brand-buy" />} {f.strategyName}
                          </p>
                          <p className="flex justify-between text-xs text-brand-navy/55">
                            <span>
                              {(f.trades as unknown[]).length} days
                              {f.today ? " · position open" : ""}
                              {f.status !== "ACTIVE" ? " · stopped" : ""}
                            </span>
                            <span className={`font-semibold ${TONE_TEXT[toneOf(total)]}`}>{formatSignedINR(total)}</span>
                          </p>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="border-t border-black/[0.05] px-4 py-2 text-[11px] text-brand-navy/40">Hypothetical results on live prices — no orders are sent.</p>
            </section>
            <section className="surface h-fit overflow-hidden">
              <p className="border-b border-black/[0.05] px-4 py-3 text-sm font-semibold text-brand-navy">Recent backtests</p>
              {runs.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-brand-navy/45">None yet.</p>
              ) : (
                <ul className="divide-y divide-black/[0.04]">
                  {runs.map((r) => {
                    const net = (r.stats as { netPnl?: number } | null)?.netPnl;
                    return (
                      <li key={r.id}>
                        <Link href={`/app/options/backtests/${r.id}`} className="block px-4 py-2.5 hover:bg-brand-bg/60">
                          <p className="text-sm font-semibold text-brand-navy">{r.strategyName}</p>
                          <p className="flex justify-between text-xs text-brand-navy/55">
                            <span>
                              {r.fromDate} → {r.toDate}
                            </span>
                            {r.status === "DONE" && net != null ? (
                              <span className={`font-semibold ${TONE_TEXT[toneOf(net)]}`}>{formatSignedINR(net)}</span>
                            ) : (
                              <span>{r.status === "RUNNING" ? `${r.daysDone}/${r.daysTotal} days` : r.status.toLowerCase()}</span>
                            )}
                          </p>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
