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
import type { Prisma } from "@prisma/client";
import Pager from "@/components/ui/pager";
import ListTabs from "@/components/ui/list-tabs";
import ListToolbar from "@/components/ui/list-toolbar";
import { pageWindow, readPageQuery } from "@/lib/pagination";
import { keepParams, qEnum, qText } from "@/lib/list-query";

export const metadata = {
  title: "Options Strategies",
  robots: { index: false },
};
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  const live = !!marketExtrasFor(userId);
  const sp = await searchParams;
  // Without the live option-price feed there is nothing to backtest or forward test, but strategies can still be saved and kept.
  const tab = live ? qEnum(sp.tab, ["strategies", "forward", "backtests"] as const, "strategies") : "strategies";
  const q = qText(sp.q);
  const state = qEnum(sp.state, ["all", "ACTIVE", "STOPPED", "DONE", "RUNNING", "FAILED"] as const, "all");
  const { page, size } = readPageQuery(sp, 10);

  // Every list is searched, filtered and paged in the database; only the tab shown is loaded.
  const like = q ? { contains: q, mode: "insensitive" as const } : undefined;
  const sWhere: Prisma.OptionStrategyWhereInput = { userId, ...(like ? { OR: [{ name: like }, { underlying: like }] } : {}) };
  const fWhere: Prisma.OptionForwardTestWhereInput = { userId, ...(like ? { strategyName: like } : {}), ...(state === "ACTIVE" ? { status: "ACTIVE" } : state === "STOPPED" ? { status: { not: "ACTIVE" } } : {}) };
  const bWhere: Prisma.OptionBacktestRunWhereInput = { userId, ...(like ? { strategyName: like } : {}), ...(state === "DONE" || state === "RUNNING" || state === "FAILED" ? { status: state } : {}) };
  const [sCount, fCount, bCount] = await Promise.all([prisma.optionStrategy.count({ where: sWhere }), prisma.optionForwardTest.count({ where: fWhere }), prisma.optionBacktestRun.count({ where: bWhere })]);
  const win = pageWindow(tab === "strategies" ? sCount : tab === "forward" ? fCount : bCount, page, size);
  const [strategies, forwards, runs] = await Promise.all([
    tab === "strategies" ? prisma.optionStrategy.findMany({ where: sWhere, orderBy: { updatedAt: "desc" }, skip: win.skip, take: win.take }) : [],
    tab === "forward"
      ? prisma.optionForwardTest.findMany({ where: fWhere, orderBy: [{ status: "asc" }, { createdAt: "desc" }], skip: win.skip, take: win.take, select: { id: true, strategyName: true, status: true, trades: true, today: true, createdAt: true } })
      : [],
    tab === "backtests"
      ? prisma.optionBacktestRun.findMany({ where: bWhere, orderBy: { createdAt: "desc" }, skip: win.skip, take: win.take, select: { id: true, strategyName: true, fromDate: true, toDate: true, status: true, stats: true, daysDone: true, daysTotal: true } })
      : [],
  ]);
  const params = keepParams({ tab: tab === "strategies" ? undefined : tab, q, state: state === "all" ? undefined : state, size: size === 10 ? undefined : String(size) });
  const none = (text: string) => <p className="rounded-2xl border border-dashed border-black/10 px-4 py-8 text-center text-sm text-brand-navy/50">{text}</p>;

  return (
    <div>
      <PageHeader
        title="Options Lab"
        icon={Sigma}
        description="Multi-leg options strategies defined around the at-the-money strike — backtested day by day on real historical option prices, with combined stop-loss and target."
      />
      <OptionsTabs active="/app/options/strategies" />
      {!live && (
        <p className="surface mt-6 p-4 text-sm text-brand-navy/65">
          Options backtests and forward tests run on real option prices from the live market-data feed, which isn&apos;t enabled for your account yet. You can still save strategies here — build one from the contracts you pick in the Options Lab — and they&apos;ll be ready to test once it is.
        </p>
      )}
      {(
        <div className="mt-6 space-y-4">
          {live && (
          <ListTabs
            basePath="/app/options/strategies"
            params={params}
            tabs={[
              { value: "strategies", label: "Strategies", count: sCount },
              { value: "forward", label: "Forward tests", count: fCount },
              { value: "backtests", label: "Backtests", count: bCount },
            ]}
            active={tab}
          />
          )}
          <ListToolbar
            params={params}
            search={{ placeholder: tab === "strategies" ? "Search name or underlying…" : "Search by strategy…" }}
            selects={
              tab === "forward"
                ? [{ name: "state", label: "Status", options: [{ value: "all", label: "Any" }, { value: "ACTIVE", label: "Running" }, { value: "STOPPED", label: "Stopped" }] }]
                : tab === "backtests"
                  ? [{ name: "state", label: "Status", options: [{ value: "all", label: "Any" }, { value: "DONE", label: "Finished" }, { value: "RUNNING", label: "Running" }, { value: "FAILED", label: "Failed" }] }]
                  : []
            }
          />
          {tab === "strategies" && (
            <>
              <StrategyList
                canTest={live}
                total={sCount}
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
              {q && strategies.length === 0 && none("No options strategies match.")}
            </>
          )}
          {tab === "forward" &&
            (forwards.length === 0 ? (
              none(q || state !== "all" ? "No forward tests match." : "None yet — press “Forward test” on a strategy.")
            ) : (
              <section className="surface overflow-hidden">
                <ul className="grid divide-y divide-black/[0.04] sm:grid-cols-2 sm:divide-y-0">
                  {forwards.map((f) => {
                    const closed = (f.trades as { netPnl: number }[]).reduce((sum, t) => sum + t.netPnl, 0);
                    const open = (f.today as { netPnl?: number } | null)?.netPnl ?? 0;
                    const total = closed + open;
                    return (
                      <li key={f.id} className="sm:border-b sm:border-black/[0.04]">
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
                <p className="border-t border-black/[0.05] px-4 py-2 text-[11px] text-brand-navy/40">Hypothetical results on live prices — no orders are sent.</p>
              </section>
            ))}
          {tab === "backtests" &&
            (runs.length === 0 ? (
              none(q || state !== "all" ? "No backtests match." : "None yet — press “Backtest” on a strategy.")
            ) : (
              <section className="surface overflow-hidden">
                <ul className="grid divide-y divide-black/[0.04] sm:grid-cols-2 sm:divide-y-0">
                  {runs.map((r) => {
                    const net = (r.stats as { netPnl?: number } | null)?.netPnl;
                    return (
                      <li key={r.id} className="sm:border-b sm:border-black/[0.04]">
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
              </section>
            ))}
          <Pager basePath="/app/options/strategies" params={params} window={win} />
        </div>
      )}
    </div>
  );
}
