import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Sigma } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/ui/page-header";
import RunProgress from "@/components/options/run-progress";
import OptionResults from "@/components/options/option-results";
import type { DayTrade, OptionBacktestStats } from "@/lib/options/backtest-engine";
import type { RunConfig } from "@/lib/options/backtest-runner";

export const metadata = { title: "Options Backtest", robots: { index: false } };
export const dynamic = "force-dynamic";

const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

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

      <OptionResults stats={stats} trades={trades} />
    </div>
  );
}
