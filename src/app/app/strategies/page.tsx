import Link from "next/link";
import { Layers, Plus } from "lucide-react";
import type { Prisma } from "@prisma/client";
import PageHeader from "@/components/ui/page-header";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import EmptyState from "@/components/empty-state";
import Pager from "@/components/ui/pager";
import ListTabs from "@/components/ui/list-tabs";
import ListToolbar from "@/components/ui/list-toolbar";
import { pageWindow, readPageQuery } from "@/lib/pagination";
import { keepParams, qEnum, qText } from "@/lib/list-query";
import { STYLE_LABEL, type StrategyStyle } from "@/lib/strategy/style";

export const metadata = { title: "Strategies", robots: { index: false } };

const TABS = [
  { value: "ACTIVE", label: "Active", about: "In real use — running in a forward test or live trading." },
  { value: "DRAFT", label: "Drafts", about: "Built but never put to work yet." },
  { value: "ARCHIVED", label: "Archived", about: "Sidelined on purpose — fully intact, restore anytime." },
  { value: "DELETED", label: "Deleted", about: "Restore or delete forever — nothing here is gone yet." },
] as const;
type Tab = (typeof TABS)[number]["value"];
const MODES = ["all", "NO_CODE", "CODE", "WEBHOOK"] as const;
const STYLES = ["all", "INTRADAY", "SWING"] as const;
const TIMEFRAMES = ["all", "1m", "3m", "5m", "15m", "30m", "60m", "4h", "1d", "1wk"] as const;
const SORTS = ["updated", "created", "name", "name-desc"] as const;
const ORDER: Record<(typeof SORTS)[number], Prisma.StrategyOrderByWithRelationInput> = {
  updated: { updatedAt: "desc" },
  created: { createdAt: "desc" },
  name: { name: "asc" },
  "name-desc": { name: "desc" },
};
const MODE_LABEL: Record<string, string> = { NO_CODE: "Built visually", CODE: "Built with code", WEBHOOK: "TradingView webhook" };
const TF_LABEL: Record<string, string> = { "1m": "1 min", "3m": "3 min", "5m": "5 min", "15m": "15 min", "30m": "30 min", "60m": "1 hour", "4h": "4 hours", "1d": "Daily", "1wk": "Weekly" };
const STATUS_DOT: Record<string, string> = { ACTIVE: "bg-brand-buy", DRAFT: "bg-brand-navy/40", ARCHIVED: "bg-brand-navy/30", DELETED: "bg-brand-sell" };

export default async function StrategiesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await auth();
  if (!session?.user?.id) return null;
  const userId = session.user.id;
  const sp = await searchParams;
  const tab = qEnum<Tab>(sp.tab, TABS.map((t) => t.value), "ACTIVE");
  const q = qText(sp.q);
  const mode = qEnum(sp.mode, MODES, "all");
  const style = qEnum(sp.style, STYLES, "all");
  const tf = qEnum(sp.tf, TIMEFRAMES, "all");
  const sort = qEnum(sp.sort, SORTS, "updated");

  // Search, filters and paging all happen in the database; only the page shown is loaded.
  const filters: Prisma.StrategyWhereInput = {
    userId,
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { instrument: { symbol: { contains: q, mode: "insensitive" } } }, { instrument: { name: { contains: q, mode: "insensitive" } } }] } : {}),
    ...(mode !== "all" ? { mode } : {}),
    ...(style !== "all" ? { style } : {}),
    ...(tf !== "all" ? { timeframe: tf } : {}),
  };
  const [counts, anyAtAll] = await Promise.all([prisma.strategy.groupBy({ by: ["status"], where: filters, _count: true }), prisma.strategy.count({ where: { userId } })]);
  const countOf = (s: string) => counts.find((c) => c.status === s)?._count ?? 0;
  const { page, size } = readPageQuery(sp);
  const win = pageWindow(countOf(tab), page, size);
  const strategies = await prisma.strategy.findMany({
    where: { ...filters, status: tab },
    include: { instrument: { select: { symbol: true, name: true } } },
    orderBy: ORDER[sort],
    skip: win.skip,
    take: win.take,
  });
  const params = keepParams({ tab: tab === "ACTIVE" ? undefined : tab, q, mode: mode === "all" ? undefined : mode, style: style === "all" ? undefined : style, tf: tf === "all" ? undefined : tf, sort: sort === "updated" ? undefined : sort, size: size === 25 ? undefined : String(size) });
  const filtered = !!q || mode !== "all" || style !== "all" || tf !== "all";

  return (
    <div>
      <PageHeader
        title="Strategies"
        icon={Layers}
        description="Build rule-based strategies visually or with code. Draft and Active are set automatically — a strategy becomes Active the moment you put it to work in forward testing."
        actions={
          <Link
            href="/app/strategies/new"
            className="inline-flex items-center gap-1.5 rounded-full bg-brand-primary px-5 py-2.5 text-sm font-semibold text-white shadow-[0_8px_20px_-10px_rgba(71,24,152,0.8)] hover:bg-brand-primary-light"
          >
            <Plus size={16} /> New strategy
          </Link>
        }
      />

      {anyAtAll === 0 ? (
        <div className="mt-8">
          <EmptyState
            pose="point"
            title="You haven't built any strategies yet."
            description="Compose entry/exit rules visually or with code, then backtest against real historical data before risking anything."
            ctaLabel="Create your first strategy"
            ctaHref="/app/strategies/new"
          />
        </div>
      ) : (
        <section className="mt-6 space-y-4">
          <ListTabs basePath="/app/strategies" params={params} tabs={TABS.map((t) => ({ value: t.value, label: t.label, count: countOf(t.value) }))} active={tab} />
          <ListToolbar
            params={params}
            search={{ placeholder: "Search by name or stock…" }}
            selects={[
              { name: "mode", label: "Built", options: MODES.map((m) => ({ value: m, label: m === "all" ? "Any way" : MODE_LABEL[m] })) },
              { name: "style", label: "Style", options: STYLES.map((s) => ({ value: s, label: s === "all" ? "Any style" : STYLE_LABEL[s as StrategyStyle] })) },
              { name: "tf", label: "Timeframe", options: TIMEFRAMES.map((t) => ({ value: t, label: t === "all" ? "Any" : TF_LABEL[t] })) },
              { name: "sort", label: "Sort", options: [{ value: "updated", label: "Recently changed" }, { value: "created", label: "Newest first" }, { value: "name", label: "Name A–Z" }, { value: "name-desc", label: "Name Z–A" }] },
            ]}
          />
          <p className="text-xs text-brand-navy/50">{TABS.find((t) => t.value === tab)!.about}</p>
          {strategies.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-black/10 px-4 py-8 text-center text-sm text-brand-navy/50">
              {filtered ? "No strategies match these filters." : tab === "ACTIVE" ? "Nothing active yet — put a draft to work in forward testing." : tab === "DRAFT" ? "No drafts — use New strategy above to start one." : "Nothing here."}
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {strategies.map((s) => (
                <Link key={s.id} href={`/app/strategies/${s.id}`} className="surface surface-interactive block p-4">
                  <div className="flex items-start gap-2">
                    <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[s.status]}`} />
                    <p className="min-w-0 break-words text-sm font-semibold leading-tight text-brand-navy">{s.name}</p>
                  </div>
                  <p className="mt-1.5 truncate pl-4 text-xs text-brand-navy/60">
                    {s.instrument.symbol.replace(/\.NS$/, "")} · {TF_LABEL[s.timeframe] ?? s.timeframe}
                    {s.style && STYLE_LABEL[s.style as StrategyStyle] ? ` · ${STYLE_LABEL[s.style as StrategyStyle]}` : ""}
                  </p>
                  <p className="mt-2 flex justify-between gap-2 pl-4 text-[11px] text-brand-navy/40">
                    <span>{MODE_LABEL[s.mode] ?? s.mode}</span>
                    <span>{s.updatedAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit", timeZone: "Asia/Kolkata" })}</span>
                  </p>
                </Link>
              ))}
            </div>
          )}
          <Pager basePath="/app/strategies" params={params} window={win} />
        </section>
      )}
    </div>
  );
}
