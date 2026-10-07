import Link from "next/link";
import { Blocks, Boxes, Network, Plus, TrendingDown, TrendingUp } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/ui/page-header";
import EmptyState from "@/components/empty-state";
import Pager from "@/components/ui/pager";
import ListTabs from "@/components/ui/list-tabs";
import { pageWindow, readPageQuery } from "@/lib/pagination";
import { conceptBlockIds, parseBlockDefinition, parseConceptDefinition, parseSystemDefinition } from "@/lib/system/definition";
import { describeConcept } from "@/lib/system/compile";
import { conditionToText } from "@/lib/strategy/format";

export const metadata = { title: "Workspace", robots: { index: false } };
export const dynamic = "force-dynamic";

// The workspace's three layers, one tab each: Blocks (market components) → Concepts (blocks combined into a bullish
// or bearish setup) → Trading systems (concepts plus every trading decision). Each list has search and paging.

const TABS = ["blocks", "concepts", "systems"] as const;
type Tab = (typeof TABS)[number];
const STATUS: Record<string, string> = { DRAFT: "Draft", ACTIVE: "Published", ARCHIVED: "Archived" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const when = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
const safeText = (f: () => string) => {
  try {
    return f();
  } catch {
    return "";
  }
};

export default async function WorkspacePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  const sp = await searchParams;
  const tab: Tab = TABS.includes(one(sp.tab) as Tab) ? (one(sp.tab) as Tab) : "blocks";
  const q = (one(sp.q) ?? "").trim().slice(0, 60);
  const side = one(sp.side) === "BULLISH" || one(sp.side) === "BEARISH" ? one(sp.side)! : "";
  const status = one(sp.status) && STATUS[one(sp.status)!] ? one(sp.status)! : "";
  const name = q ? { contains: q, mode: "insensitive" as const } : undefined;
  const { page, size } = readPageQuery(sp);

  const systemsWhere: Prisma.WorkspaceWhereInput = { userId, ...(status ? { status: status as "DRAFT" | "ACTIVE" | "ARCHIVED" } : { status: { not: "ARCHIVED" } }), ...(name ? { name } : {}) };
  const conceptsWhere: Prisma.ConceptWhereInput = { userId, ...(side ? { classification: side } : {}), ...(name ? { name } : {}) };
  const blocksWhere: Prisma.BlockWhereInput = { userId, ...(name ? { name } : {}) };
  const [blockCount, conceptCount, systemCount] = await Promise.all([
    prisma.block.count({ where: tab === "blocks" ? blocksWhere : { userId } }),
    prisma.concept.count({ where: tab === "concepts" ? conceptsWhere : { userId } }),
    prisma.workspace.count({ where: tab === "systems" ? systemsWhere : { userId, status: { not: "ARCHIVED" } } }),
  ]);
  const total = tab === "blocks" ? blockCount : tab === "concepts" ? conceptCount : systemCount;
  const win = pageWindow(total, page, size);
  const filtered = !!(q || side || status);
  const params = { tab: tab === "blocks" ? undefined : tab, q: q || undefined, side: side || undefined, status: status || undefined };

  let body: React.ReactNode = null;
  if (tab === "blocks") {
    const rows = await prisma.block.findMany({ where: blocksWhere, orderBy: { updatedAt: "desc" }, skip: win.skip, take: win.take });
    body = rows.length ? (
      <div className="overflow-x-auto surface">
        <table className="data-table">
          <thead>
            <tr><th>Block</th><th>Present when</th><th>Changed</th></tr>
          </thead>
          <tbody>
            {rows.map((b) => {
              const def = parseBlockDefinition(b.definition);
              return (
                <tr key={b.id}>
                  <td><Link href={`/app/workspaces/blocks/${b.id}`} className="font-semibold text-brand-primary hover:underline">{b.name}</Link>{b.description && <span className="block max-w-xs truncate text-xs text-brand-navy/45">{b.description}</span>}</td>
                  <td className="max-w-md truncate text-brand-navy/65">{def ? safeText(() => conditionToText(def.condition)) : "—"}</td>
                  <td className="text-brand-navy/60">{when(b.updatedAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    ) : filtered ? (
      <EmptyState pose="idle" title="No blocks match." description="Try a different search, or clear it." ctaLabel="Clear" ctaHref="/app/workspaces" />
    ) : (
      <EmptyState pose="idle" title="No blocks yet." description="A block is one market component you define once and reuse: My BOS, My FVG, an order block, a session, a level. Start with one." ctaLabel="New block" ctaHref="/app/workspaces/blocks/new" />
    );
  } else if (tab === "concepts") {
    const rows = await prisma.concept.findMany({ where: conceptsWhere, orderBy: { updatedAt: "desc" }, skip: win.skip, take: win.take });
    const defs = rows.map((r) => parseConceptDefinition(r.definition));
    const ids = [...new Set(defs.flatMap((d) => conceptBlockIds(d?.logic ?? null)))];
    const blocks = ids.length ? await prisma.block.findMany({ where: { userId, id: { in: ids } }, select: { id: true, name: true } }) : [];
    const names = Object.fromEntries(blocks.map((b) => [b.id, { name: b.name }]));
    body = rows.length ? (
      <div className="overflow-x-auto surface">
        <table className="data-table">
          <thead>
            <tr><th>Concept</th><th>Side</th><th>Setup valid when</th><th>Changed</th></tr>
          </thead>
          <tbody>
            {rows.map((c, i) => (
              <tr key={c.id}>
                <td><Link href={`/app/workspaces/concepts/${c.id}`} className="font-semibold text-brand-primary hover:underline">{c.name}</Link></td>
                <td>{c.classification === "BEARISH" ? <span className="inline-flex items-center gap-1 text-brand-sell"><TrendingDown size={13} /> Bearish</span> : <span className="inline-flex items-center gap-1 text-brand-buy"><TrendingUp size={13} /> Bullish</span>}</td>
                <td className="max-w-md truncate text-brand-navy/65">{defs[i] ? describeConcept(defs[i]!, names) : "—"}</td>
                <td className="text-brand-navy/60">{when(c.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : filtered ? (
      <EmptyState pose="idle" title="No concepts match." description="Try a different search or side, or clear the filter." ctaLabel="Clear" ctaHref="/app/workspaces?tab=concepts" />
    ) : (
      <EmptyState pose="idle" title="No concepts yet." description="A concept combines blocks into one setup — e.g. liquidity sweep → BOS → FVG → retest within 10 candles — and is classified bullish or bearish." ctaLabel="New concept" ctaHref="/app/workspaces/concepts/new" />
    );
  } else {
    const rows = await prisma.workspace.findMany({ where: systemsWhere, orderBy: { updatedAt: "desc" }, skip: win.skip, take: win.take, include: { _count: { select: { versions: true } } } });
    const defs = rows.map((r) => parseSystemDefinition(r.draft));
    const ids = [...new Set(defs.map((d) => d?.instrumentId).filter((x): x is string => !!x))];
    const instruments = ids.length ? await prisma.instrument.findMany({ where: { id: { in: ids } }, select: { id: true, symbol: true } }) : [];
    const symbolOf = new Map(instruments.map((i) => [i.id, i.symbol.replace(/\.NS$/, "")]));
    body = rows.length ? (
      <div className="overflow-x-auto surface">
        <table className="data-table">
          <thead>
            <tr><th>Trading system</th><th>Instrument</th><th>Timeframe</th><th className="num-cell">Concepts</th><th>Status</th><th className="num-cell">Versions</th><th>Changed</th></tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id}>
                <td><Link href={`/app/workspaces/${r.id}`} className="font-semibold text-brand-primary hover:underline">{r.name}</Link>{r.description && <span className="block max-w-xs truncate text-xs text-brand-navy/45">{r.description}</span>}</td>
                <td>{defs[i]?.instrumentId ? (symbolOf.get(defs[i]!.instrumentId) ?? "—") : "—"}</td>
                <td>{defs[i]?.timeframes.primary ?? "—"}{defs[i]?.productType === "DELIVERY" ? " · delivery" : ""}</td>
                <td className="num-cell">{defs[i]?.concepts.filter((c) => c.enabled).length ?? 0}</td>
                <td>{STATUS[r.status]}</td>
                <td className="num-cell">{r._count.versions}</td>
                <td className="text-brand-navy/60">{when(r.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : filtered ? (
      <EmptyState pose="idle" title="No trading systems match." description="Try a different search or status, or clear the filter." ctaLabel="Clear" ctaHref="/app/workspaces?tab=systems" />
    ) : (
      <EmptyState pose="idle" title="No trading systems yet." description="A trading system picks your concepts and makes every trading decision: instrument, timeframes, sessions, capital, sizing, leverage, risk and what to do when setups conflict." ctaLabel="New trading system" ctaHref="/app/workspaces/new" />
    );
  }

  const NEW: Record<Tab, { href: string; label: string }> = {
    blocks: { href: "/app/workspaces/blocks/new", label: "New block" },
    concepts: { href: "/app/workspaces/concepts/new", label: "New concept" },
    systems: { href: "/app/workspaces/new", label: "New trading system" },
  };
  const layers = [
    { tab: "blocks" as const, icon: Blocks, title: "1 · Blocks", text: "What is this market component? My BOS, FVG, order block, sweep, level, session, volume." },
    { tab: "concepts" as const, icon: Boxes, title: "2 · Concepts", text: "How do blocks combine into a setup? All / in sequence / confirmed by / unless — bullish or bearish." },
    { tab: "systems" as const, icon: Network, title: "3 · Trading systems", text: "What do I do with these setups? Instrument, timeframes, sessions, capital, sizing, risk, conflicts." },
  ];

  return (
    <div>
      <PageHeader
        title="Workspace"
        icon={Network}
        description="Build in three layers, each with one job. Define a component once as a block, reuse it across concepts, and reuse a concept across trading systems. Publishing a trading system freezes exactly what it uses and runs it through the same backtest, forward test and live engines as any strategy."
        actions={
          <Link href={NEW[tab].href} className="inline-flex items-center gap-1.5 rounded-full bg-brand-primary px-4 py-2 text-sm font-semibold text-white">
            <Plus size={15} /> {NEW[tab].label}
          </Link>
        }
      />
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        {layers.map((l) => (
          <Link key={l.tab} href={l.tab === "blocks" ? "/app/workspaces" : `/app/workspaces?tab=${l.tab}`} className={`rounded-xl border p-3 transition-colors ${tab === l.tab ? "border-brand-primary bg-brand-primary/5" : "border-brand-navy/10 hover:border-brand-primary/50"}`}>
            <span className="flex items-center gap-1.5 text-sm font-semibold text-brand-navy"><l.icon size={15} className="text-brand-primary" /> {l.title}</span>
            <span className="mt-0.5 block text-xs text-brand-navy/55">{l.text}</span>
          </Link>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
        <ListTabs
          basePath="/app/workspaces"
          params={{ q: q || undefined, size: String(size) }}
          tabs={[
            { value: "blocks", label: "Blocks", count: blockCount },
            { value: "concepts", label: "Concepts", count: conceptCount },
            { value: "systems", label: "Trading systems", count: systemCount },
          ]}
          active={tab}
        />
        <form method="get" className="flex flex-wrap items-end gap-2 text-xs">
          {tab !== "blocks" && <input type="hidden" name="tab" value={tab} />}
          <input type="hidden" name="size" value={size} />
          <input name="q" defaultValue={q} maxLength={60} placeholder="Search by name" aria-label="Search by name" className="w-44 rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-sm text-brand-navy" />
          {tab === "concepts" && (
            <select name="side" defaultValue={side} aria-label="Side" className="rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-sm text-brand-navy">
              <option value="">Bullish and bearish</option>
              <option value="BULLISH">Bullish</option>
              <option value="BEARISH">Bearish</option>
            </select>
          )}
          {tab === "systems" && (
            <select name="status" defaultValue={status} aria-label="Status" className="rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-sm text-brand-navy">
              <option value="">Active and drafts</option>
              {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          )}
          <button type="submit" className="rounded-full bg-brand-primary px-4 py-1.5 text-xs font-semibold text-white">Search</button>
          {filtered && <Link href={tab === "blocks" ? "/app/workspaces" : `/app/workspaces?tab=${tab}`} className="px-1 py-1.5 text-xs font-semibold text-brand-primary">Clear</Link>}
        </form>
      </div>
      <div className="mt-4">{body}</div>
      <Pager basePath="/app/workspaces" params={params} window={win} />
    </div>
  );
}
