import { parseTargets } from "@/lib/trading-engine/targets-config";
import { parseEntryPlan } from "@/lib/trading-engine/entry-plan-config";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { marketDataFor } from "@/lib/market-data";
import PaperSessionForm from "@/components/paper-session-form";
import EmptyState from "@/components/empty-state";
import { Activity, Plus } from "lucide-react";
import CollapsiblePanel from "@/components/ui/collapsible-panel";
import StatusBadge from "@/components/ui/status-badge";
import { formatINR, formatPct, toneOf, TONE_TEXT } from "@/lib/format";
import PageHeader from "@/components/ui/page-header";
import type { Prisma } from "@prisma/client";
import Pager from "@/components/ui/pager";
import ListTabs from "@/components/ui/list-tabs";
import ListToolbar from "@/components/ui/list-toolbar";
import { pageWindow, readPageQuery } from "@/lib/pagination";
import { keepParams, qEnum, qText } from "@/lib/list-query";

export const metadata = { title: "Forward Testing", robots: { index: false } };


const SORTS = ["new", "old", "name", "synced"] as const;
const ORDER: Record<(typeof SORTS)[number], Prisma.PaperSessionOrderByWithRelationInput> = {
  new: { createdAt: "desc" },
  old: { createdAt: "asc" },
  name: { strategyName: "asc" },
  synced: { updatedAt: "desc" },
};

export default async function ForwardTestingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await auth();
  const market = marketDataFor(session?.user?.id, "trading");
  if (!session?.user?.id) return null;
  const userId = session.user.id;
  const sp = await searchParams;
  const tab = qEnum(sp.tab, ["running", "history"] as const, "running");
  const q = qText(sp.q);
  const state = qEnum(sp.state, ["all", "ACTIVE", "PAUSED"] as const, "all");
  const position = qEnum(sp.position, ["all", "in", "flat"] as const, "all");
  const sort = qEnum(sp.sort, SORTS, "new");
  const filters: Prisma.PaperSessionWhereInput = {
    userId,
    ...(q ? { OR: [{ strategyName: { contains: q, mode: "insensitive" } }, { instrumentSymbol: { contains: q, mode: "insensitive" } }] } : {}),
    ...(position === "in" ? { positionQuantity: { not: null } } : position === "flat" ? { positionQuantity: null } : {}),
  };
  const running: Prisma.PaperSessionWhereInput = { status: state === "all" ? { not: "STOPPED" } : state };
  const [runningCount, historyCount, total] = await Promise.all([
    prisma.paperSession.count({ where: { ...filters, ...running } }),
    prisma.paperSession.count({ where: { ...filters, status: "STOPPED" } }),
    prisma.paperSession.count({ where: { userId } }),
  ]);
  const { page, size } = readPageQuery(sp);
  const win = pageWindow(tab === "running" ? runningCount : historyCount, page, size);
  const params = keepParams({ tab: tab === "running" ? undefined : tab, q, state: state === "all" ? undefined : state, position: position === "all" ? undefined : position, sort: sort === "new" ? undefined : sort, size: size === 25 ? undefined : String(size) });

  const [strategies, sessions] = await Promise.all([
    prisma.strategy.findMany({
      // Deleted strategies never belong in a "pick one to run" list — that
      // would defeat the point of deleting one in the first place.
      where: { userId: session.user.id, status: { not: "DELETED" } },
      include: { instrument: true },
      orderBy: { updatedAt: "desc" },
    }),
    // Only the page shown is loaded (search, filters and paging happen in the database).
    prisma.paperSession.findMany({
      where: { ...filters, ...(tab === "running" ? running : { status: "STOPPED" }) },
      orderBy: ORDER[sort],
      skip: win.skip,
      take: win.take,
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
        const candles = await market.getHistoricalCandles(symbol, "5d", "1d");
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
      <PageHeader title="Forward Testing" icon={Activity} description={<>Validate a strategy on new market data as it arrives. It applies your rules to the strategy&apos;s own candles (daily or intraday) and records the hypothetical trades they would take — no orders are sent and no money is involved. It updates about every 5 minutes during market hours (press <strong>Sync now</strong> to catch up), and hypothetical positions close when a stop-loss, target or trailing stop is hit.</>} />

      <CollapsiblePanel
        title="Start a new forward test"
        subtitle="Pick a strategy and a notional capital to size hypothetical trades"
        icon={<Plus size={17} />}
        defaultOpen={total === 0}
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
            targets: parseTargets(s.targetsConfig),
            entryPlan: parseEntryPlan(s.entryPlan),
            trailingSlEnabled: s.trailingSlEnabled,
            trailingSlUnit: s.trailingSlUnit,
            trailingSlValue: s.trailingSlValue,
            maxPyramidEntries: s.maxPyramidEntries,
          }))}
        />
      </CollapsiblePanel>

      {total === 0 ? (
        <div className="mt-6">
          <EmptyState pose="analyzing" title="No forward tests yet." description="Start one above to run a strategy forward with notional capital against real market data." />
        </div>
      ) : (
        <section className="mt-8 space-y-4">
          <ListTabs
            basePath="/app/forward-testing"
            params={params}
            tabs={[
              { value: "running", label: "Running", count: runningCount },
              { value: "history", label: "History", count: historyCount },
            ]}
            active={tab}
          />
          <ListToolbar
            params={params}
            search={{ placeholder: "Search by strategy or stock…" }}
            selects={[
              ...(tab === "running" ? [{ name: "state", label: "Status", options: [{ value: "all", label: "Running or paused" }, { value: "ACTIVE", label: "Running" }, { value: "PAUSED", label: "Paused" }] }] : []),
              { name: "position", label: "Position", options: [{ value: "all", label: "Any" }, { value: "in", label: "In a position" }, { value: "flat", label: "Flat" }] },
              { name: "sort", label: "Sort", options: [{ value: "new", label: "Newest first" }, { value: "old", label: "Oldest first" }, { value: "name", label: "Strategy A–Z" }, { value: "synced", label: "Recently updated" }] },
            ]}
          />
          {sessions.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-black/10 px-4 py-8 text-center text-sm text-brand-navy/50">{tab === "running" ? "No running forward tests match." : "No finished forward tests match."}</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {sessions.map((s) => {
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
                  <Link key={s.id} href={`/app/forward-testing/${s.id}`} className={`surface surface-interactive block p-5 ${tab === "history" ? "opacity-80 hover:opacity-100" : ""}`}>
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
          )}
          <Pager basePath="/app/forward-testing" params={params} window={win} />
        </section>
      )}
    </div>
  );
}
