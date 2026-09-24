import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { marketDataProvider } from "@/lib/market-data";
import PaperSessionForm from "@/components/paper-session-form";
import EmptyState from "@/components/empty-state";
import { Activity, History, Plus, Radio } from "lucide-react";
import CollapsiblePanel from "@/components/ui/collapsible-panel";
import StatusBadge from "@/components/ui/status-badge";
import { formatINR, formatPct, toneOf, TONE_TEXT } from "@/lib/format";
import PageHeader from "@/components/ui/page-header";

export const metadata = { title: "Paper Trading", robots: { index: false } };


export default async function PaperTradingPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const [strategies, sessions] = await Promise.all([
    prisma.strategy.findMany({
      // Deleted strategies never belong in a "pick one to run" list — that
      // would defeat the point of deleting one in the first place.
      where: { userId: session.user.id, status: { not: "DELETED" } },
      include: { instrument: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.paperSession.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // Real bug, fixed here: this card's P&L used to add the position's full
  // entry-price notional on top of `cash`, which is never debited/credited
  // at entry (it only reflects realized gains from closed trades) — that
  // double-counted the entry cost as unrealized profit, showing wildly
  // inflated P&L (e.g. +98.9%) for any session with an open position. The
  // correct number is cash plus the position's *unrealized* gain against
  // its current price — the same fix already applied to the detail page's
  // equity calc and to the kill-switch's risk check in paper-actions.ts.
  const inPositionSymbols = Array.from(
    new Set(sessions.filter((s) => s.positionQuantity !== null).map((s) => s.instrumentSymbol)),
  );
  const latestCloseBySymbol = new Map<string, number>();
  await Promise.all(
    inPositionSymbols.map(async (symbol) => {
      try {
        const candles = await marketDataProvider.getHistoricalCandles(symbol, "5d", "1d");
        const latest = candles.at(-1)?.close;
        if (latest !== undefined) latestCloseBySymbol.set(symbol, latest);
      } catch {
        // Leave this symbol out of the map — sessions on it fall back to
        // entry price below (unrealizedGain of 0), same as a session with
        // no position at all, rather than showing a broken/stale P&L.
      }
    }),
  );

  return (
    <div>
      <PageHeader title="Paper Trading" icon={Activity} description={<>Run a strategy forward with virtual capital. This uses end-of-day data and updates when you click <strong>Sync now</strong> — it is not a continuous real-time simulation.</>} />

      <CollapsiblePanel
        title="Start a new paper session"
        subtitle="Pick a strategy and virtual capital — no real money involved"
        icon={Plus}
        defaultOpen={sessions.length === 0}
      >
        <PaperSessionForm
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
      </CollapsiblePanel>

      {sessions.length === 0 ? (
        <div className="mt-6">
          <EmptyState pose="analyzing" title="No paper trading sessions yet." description="Start one above to run a strategy forward with virtual capital against real market data." />
        </div>
      ) : (
        [
          { key: "live", title: "Live sessions", icon: Radio, list: sessions.filter((s) => s.status !== "STOPPED") },
          { key: "history", title: "History", icon: History, list: sessions.filter((s) => s.status === "STOPPED") },
        ]
          .filter((g) => g.list.length > 0)
          .map((g) => (
            <section key={g.key} className="mt-8">
              <div className="mb-3 flex items-center gap-2">
                <g.icon size={16} className="text-brand-primary" />
                <h2 className="text-sm font-semibold text-brand-navy">{g.title}</h2>
                <span className="rounded-full bg-brand-navy/[0.06] px-2 py-0.5 text-xs font-semibold text-brand-navy/55">{g.list.length}</span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {g.list.map((s) => {
                  const inPosition = s.positionQuantity !== null;
                  const latestClose = latestCloseBySymbol.get(s.instrumentSymbol) ?? s.positionEntryPrice ?? 0;
                  const unrealizedGain =
                    inPosition && s.positionEntryPrice !== null
                      ? (s.direction === "SHORT" ? s.positionEntryPrice - latestClose : latestClose - s.positionEntryPrice) * (s.positionQuantity ?? 0)
                      : 0;
                  const equity = s.cash + unrealizedGain;
                  const pnlPct = ((equity - s.startingCapital) / s.startingCapital) * 100;
                  const tone = toneOf(pnlPct);
                  return (
                    <Link key={s.id} href={`/app/paper-trading/${s.id}`} className={`surface surface-interactive block p-5 ${g.key === "history" ? "opacity-80 hover:opacity-100" : ""}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-brand-navy">{s.strategyName}</p>
                          <p className="mt-0.5 text-xs text-brand-navy/50">{s.instrumentSymbol}</p>
                        </div>
                        <StatusBadge status={s.status} />
                      </div>
                      <div className="mt-4 flex items-end justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-navy/40">Equity</p>
                          <p className="num text-lg font-bold text-brand-navy">{formatINR(equity)}</p>
                        </div>
                        <p className={`num text-xl font-bold ${TONE_TEXT[tone]}`}>{formatPct(pnlPct)}</p>
                      </div>
                      <div className="mt-3 flex items-center justify-between border-t border-black/[0.05] pt-3 text-xs text-brand-navy/50">
                        <span className="flex items-center gap-1.5">
                          <span className={`h-1.5 w-1.5 rounded-full ${inPosition ? "bg-brand-blue" : "bg-brand-navy/25"}`} />
                          {inPosition ? "In position" : "Flat"}
                        </span>
                        <span>
                          Synced {s.lastSyncedTime ? new Date(s.lastSyncedTime * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }) : "never"}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))
      )}
    </div>
  );
}
