import Link from "next/link";
import { notFound } from "next/navigation";
import { Activity, ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/ui/page-header";
import OptionResults from "@/components/options/option-results";
import ForwardControls from "@/components/options/forward-controls";
import { summarizeOptionBacktest, type DayTrade } from "@/lib/options/backtest-engine";
import type { RunConfig } from "@/lib/options/backtest-runner";
import type { ForwardOpen } from "@/lib/options/forward-runner";
import { formatSignedINR, toneOf, TONE_TEXT } from "@/lib/format";

export const metadata = { title: "Options Forward Test", robots: { index: false } };
export const dynamic = "force-dynamic";

const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  const test = await prisma.optionForwardTest.findFirst({ where: { id, userId } });
  if (!test) notFound();
  const cfg = test.config as unknown as RunConfig;
  const trades = (test.trades as unknown as DayTrade[]).slice().sort((a, b) => b.date.localeCompare(a.date));
  const open = test.today as unknown as ForwardOpen | null;
  const stats = trades.length ? summarizeOptionBacktest(trades) : null;
  const legs = cfg.legs
    .map((l) => `${l.side === "BUY" ? "Buy" : "Sell"} ${l.lots}× ${l.offset === 0 ? "ATM" : l.offset > 0 ? `ATM+${l.offset}` : `ATM${l.offset}`} ${l.type}`)
    .join(" · ");
  const active = test.status === "ACTIVE";

  return (
    <div className="space-y-6">
      <Link href="/app/options/strategies" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-primary">
        <ArrowLeft size={13} /> Options strategies
      </Link>
      <PageHeader
        title={test.strategyName}
        icon={Activity}
        eyebrow={active ? "Options forward test · running" : "Options forward test · stopped"}
        description={
          <>
            {cfg.underlying} · {legs} · enter {toTime(cfg.entryMinute)}, square off {toTime(cfg.exitMinute)} · lot size {cfg.lotSize}. Hypothetical trades on live option prices —
            no orders are sent and no money is involved. Checked every 5 minutes in market hours; stop-loss and target times come from minute prices.
          </>
        }
      />
      <ForwardControls id={test.id} active={active} />

      <section className="surface p-5">
        <p className="text-sm font-semibold text-brand-navy">Today</p>
        {open ? (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-brand-navy/55">
              Entered {toTime(open.entryMinute)} · {open.expiry} expiry · spot {open.spot.toLocaleString("en-IN")} (ATM {open.atm}) · as of {toTime(open.asOfMinute)} IST
            </p>
            <ul className="space-y-1 text-sm tabular-nums">
              {open.legs.map((l) => (
                <li key={l.symbol}>
                  <span className={l.side === "BUY" ? "text-[#0b6b30]" : "text-[#9b1111]"}>{l.side === "BUY" ? "Bought" : "Sold"}</span> {l.qty} × {l.strike} {l.type} at ₹{l.entry}{" "}
                  · now ₹{l.exit}
                </li>
              ))}
            </ul>
            <p className={`text-lg font-bold tabular-nums ${TONE_TEXT[toneOf(open.netPnl)]}`}>{formatSignedINR(open.netPnl)} open (after costs)</p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-brand-navy/55">
            {active ? `No open position — the next entry is at ${toTime(cfg.entryMinute)} on a trading day you selected.` : "This forward test is stopped."}
          </p>
        )}
      </section>

      {trades.length > 0 ? <OptionResults stats={stats} trades={trades} /> : <p className="text-sm text-brand-navy/50">No finished days yet.</p>}
    </div>
  );
}
