import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Sigma } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/ui/page-header";
import StatCard from "@/components/ui/stat-card";
import EquityCurveChart from "@/components/equity-curve-chart";
import RunProgress from "@/components/options/run-progress";
import type { DayTrade, OptionBacktestStats } from "@/lib/options/backtest-engine";
import type { RunConfig } from "@/lib/options/backtest-runner";
import { formatSignedINR, toneOf, TONE_TEXT } from "@/lib/format";

export const metadata = { title: "Options Backtest", robots: { index: false } };
export const dynamic = "force-dynamic";

const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const WEEKDAY = ["", "Mon", "Tue", "Wed", "Thu", "Fri"];
const REASON = { TIME: "Square-off", STOP_LOSS: "Stop-loss", TARGET: "Target" } as const;
const inr = (n: number) => formatSignedINR(n);
const day = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit", timeZone: "UTC" });

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  const run = await prisma.optionBacktestRun.findFirst({ where: { id, userId } });
  if (!run) notFound();
  const cfg = run.config as unknown as RunConfig;
  const trades = (run.trades as unknown as DayTrade[]).slice().sort((a, b) => b.date.localeCompare(a.date));
  const stats = run.stats as unknown as OptionBacktestStats | null;
  const legs = cfg.legs.map((l) => `${l.side === "BUY" ? "Buy" : "Sell"} ${l.lots}× ${l.offset === 0 ? "ATM" : l.offset > 0 ? `ATM+${l.offset}` : `ATM${l.offset}`} ${l.type}`).join(" · ");

  return (
    <div className="space-y-6">
      <Link href="/app/options/strategies" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-primary">
        <ArrowLeft size={13} /> Options strategies
      </Link>
      <PageHeader
        title={run.strategyName}
        icon={Sigma}
        eyebrow="Options backtest"
        description={
          <>
            {cfg.underlying} · {legs} · enter {toTime(cfg.entryMinute)}, square off {toTime(cfg.exitMinute)} · {run.fromDate} → {run.toDate} · lot size {cfg.lotSize} (today&apos;s) · ₹
            {run.brokeragePerOrder}/order, {run.slippagePct}% slippage. Real historical option prices; past results don&apos;t guarantee future ones.
          </>
        }
      />

      {run.status === "RUNNING" && <RunProgress runId={run.id} daysDone={run.daysDone} daysTotal={run.daysTotal} />}
      {run.status === "FAILED" && <p className="surface p-5 text-sm text-brand-sell">This backtest stopped: {run.error ?? "unknown error"}.</p>}

      {stats && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Net P&L" value={inr(stats.netPnl)} tone={toneOf(stats.netPnl)} sub={`${stats.days} days traded`} />
            <StatCard label="Win rate" value={`${stats.winRatePct}%`} sub={`${stats.wins} wins · ${stats.losses} losses`} />
            <StatCard label="Max drawdown" value={inr(-stats.maxDrawdown)} tone={stats.maxDrawdown > 0 ? "down" : "flat"} sub={`Profit factor ${stats.profitFactor ?? "∞"}`} />
            <StatCard label="Per day" value={inr(stats.expectancy)} tone={toneOf(stats.expectancy)} sub={`Avg win ${inr(stats.avgWin)} · avg loss ${inr(stats.avgLoss)}`} />
          </div>
          {stats.equity.length > 1 && (
            <section className="surface p-4">
              <p className="mb-2 text-sm font-semibold text-brand-navy">Cumulative P&amp;L</p>
              <EquityCurveChart points={stats.equity.map((e) => ({ time: Date.parse(`${e.date}T09:15:00+05:30`) / 1000, equity: e.value }))} />
            </section>
          )}
          <div className="grid gap-4 lg:grid-cols-3">
            <section className="surface p-4">
              <p className="mb-2 text-sm font-semibold text-brand-navy">By weekday</p>
              <ul className="space-y-1.5 text-sm">
                {stats.byWeekday.filter((w) => w.days).map((w) => (
                  <li key={w.weekday} className="flex justify-between">
                    <span className="text-brand-navy/70">
                      {WEEKDAY[w.weekday]} <span className="text-xs text-brand-navy/40">({w.days})</span>
                    </span>
                    <span className={`font-semibold tabular-nums ${TONE_TEXT[toneOf(w.netPnl)]}`}>{inr(w.netPnl)}</span>
                  </li>
                ))}
              </ul>
            </section>
            <section className="surface p-4 lg:col-span-2">
              <p className="mb-2 text-sm font-semibold text-brand-navy">Exits</p>
              <div className="grid grid-cols-3 gap-3 text-center">
                {[
                  ["Square-off", stats.days - stats.stopLossHits - stats.targetHits],
                  ["Stop-loss", stats.stopLossHits],
                  ["Target", stats.targetHits],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-xl bg-brand-bg/70 py-3">
                    <p className="text-lg font-bold text-brand-navy">{v}</p>
                    <p className="text-[11px] uppercase tracking-wide text-brand-navy/45">{k}</p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-brand-navy/50">
                Best day {inr(stats.bestDay)} · worst day {inr(stats.worstDay)}
              </p>
            </section>
          </div>
        </>
      )}

      {trades.length > 0 && (
        <section className="surface overflow-hidden">
          <p className="border-b border-black/[0.05] px-4 py-3 text-sm font-semibold text-brand-navy">Every trading day ({trades.length})</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-xs">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wide text-brand-navy/45">
                  {["Date", "Expiry", "Spot / ATM", "Legs (entry → exit)", "Premium", "Exit", "Net P&L"].map((h) => (
                    <th key={h} className="px-3 py-2 font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {trades.map((t) => (
                  <tr key={t.date} className="border-t border-black/[0.04] align-top">
                    <td className="whitespace-nowrap px-3 py-2 font-semibold text-brand-navy">
                      {day(t.date)} <span className="font-normal text-brand-navy/40">{WEEKDAY[(new Date(`${t.date}T00:00:00Z`).getUTCDay() + 6) % 7 + 1]}</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-brand-navy/60">{day(t.expiry)}</td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-brand-navy/70">
                      {t.spot.toLocaleString("en-IN")} / {t.atm}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {t.legs.map((l) => (
                        <span key={l.symbol} className="block whitespace-nowrap">
                          <span className={l.side === "BUY" ? "text-[#0b6b30]" : "text-[#9b1111]"}>{l.side === "BUY" ? "B" : "S"}</span> {l.strike} {l.type} ×{l.qty}: {l.entry} → {l.exit}
                        </span>
                      ))}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-brand-navy/70">{inr(t.premium)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-brand-navy/70">
                      {REASON[t.exitReason]} {toTime(t.exitMinute)}
                    </td>
                    <td className={`whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums ${TONE_TEXT[toneOf(t.netPnl)]}`}>{inr(t.netPnl)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
