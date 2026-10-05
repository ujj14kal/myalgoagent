import Link from "next/link";
import { Network, Plus } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/ui/page-header";
import EmptyState from "@/components/empty-state";
import Pager from "@/components/ui/pager";
import { pageWindow, readPageQuery } from "@/lib/pagination";
import { parseDefinition } from "@/lib/workspace/definition";

export const metadata = { title: "Workspaces", robots: { index: false } };
export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = { DRAFT: "Draft", ACTIVE: "Published", ARCHIVED: "Archived" };
const SORTS: Record<string, Prisma.WorkspaceOrderByWithRelationInput> = { updated: { updatedAt: "desc" }, name: { nameNormalized: "asc" }, created: { createdAt: "desc" } };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function WorkspacesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  const sp = await searchParams;
  const status = one(sp.status) && STATUS[one(sp.status)!] ? one(sp.status)! : "";
  const q = (one(sp.q) ?? "").trim().slice(0, 60);
  const sort = SORTS[one(sp.sort) ?? ""] ? one(sp.sort)! : "updated";
  const where: Prisma.WorkspaceWhereInput = {
    userId,
    // Archived workspaces are kept out of the way unless asked for.
    ...(status ? { status: status as "DRAFT" | "ACTIVE" | "ARCHIVED" } : { status: { not: "ARCHIVED" } }),
    ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
  };
  const total = await prisma.workspace.count({ where });
  const { page, size } = readPageQuery(sp);
  const win = pageWindow(total, page, size);
  const rows = await prisma.workspace.findMany({ where, orderBy: SORTS[sort], skip: win.skip, take: win.take, include: { _count: { select: { versions: true } } } });
  const defs = rows.map((r) => parseDefinition(r.draft));
  const ids = [...new Set(defs.map((d) => d?.instrumentId).filter((x): x is string => !!x))];
  const instruments = ids.length ? await prisma.instrument.findMany({ where: { id: { in: ids } }, select: { id: true, symbol: true } }) : [];
  const symbolOf = new Map(instruments.map((i) => [i.id, i.symbol.replace(/\.NS$/, "")]));
  const filtered = !!(status || q);
  const when = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

  return (
    <div>
      <PageHeader
        title="Workspaces"
        icon={Network}
        description="Connect several strategies and rules into one plan: how their signals combine, how the position is built and left, and how it is sized. Publish a version and it runs through the same backtest, forward test and live engines as any strategy."
        actions={
          <Link href="/app/workspaces/new" className="inline-flex items-center gap-1.5 rounded-full bg-brand-primary px-4 py-2 text-sm font-semibold text-white">
            <Plus size={15} /> New workspace
          </Link>
        }
      />
      {(total > 0 || filtered) && (
        <form method="get" className="mt-2 flex flex-wrap items-end gap-2 text-xs">
          <label className="flex flex-col gap-1 text-brand-navy/55">
            Status
            <select name="status" defaultValue={status} className="rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-sm text-brand-navy">
              <option value="">Active and drafts</option>
              {Object.entries(STATUS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-brand-navy/55">
            Name
            <input name="q" defaultValue={q} maxLength={60} placeholder="Search" className="w-44 rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-sm text-brand-navy" />
          </label>
          <label className="flex flex-col gap-1 text-brand-navy/55">
            Sort
            <select name="sort" defaultValue={sort} className="rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-sm text-brand-navy">
              <option value="updated">Recently changed</option>
              <option value="name">Name</option>
              <option value="created">Newest</option>
            </select>
          </label>
          <input type="hidden" name="size" value={size} />
          <button type="submit" className="rounded-full bg-brand-primary px-4 py-1.5 text-xs font-semibold text-white">
            Apply
          </button>
          {filtered && (
            <Link href="/app/workspaces" className="px-1 py-1.5 text-xs font-semibold text-brand-primary">
              Clear
            </Link>
          )}
        </form>
      )}
      {rows.length === 0 ? (
        <div className="mt-8">
          {filtered ? (
            <EmptyState pose="idle" title="No workspaces match." description="Try a different search or status, or clear the filter." ctaLabel="Clear filter" ctaHref="/app/workspaces" />
          ) : (
            <EmptyState pose="idle" title="No workspaces yet." description="A workspace turns strategies you already have into one connected plan. Start one, add your strategies and link their rules." ctaLabel="New workspace" ctaHref="/app/workspaces/new" />
          )}
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto surface">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Instrument</th>
                <th>Status</th>
                <th className="num-cell">Versions</th>
                <th>Changed</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/app/workspaces/${r.id}`} className="font-semibold text-brand-primary hover:underline">
                      {r.name}
                    </Link>
                    {r.description && <span className="block max-w-xs truncate text-xs text-brand-navy/45">{r.description}</span>}
                  </td>
                  <td>{defs[i]?.instrumentId ? symbolOf.get(defs[i]!.instrumentId) ?? "—" : "—"}</td>
                  <td>{STATUS[r.status]}</td>
                  <td className="num-cell">{r._count.versions}</td>
                  <td className="text-brand-navy/60">{when(r.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager basePath="/app/workspaces" params={{ status, q, sort: sort === "updated" ? undefined : sort }} window={win} />
    </div>
  );
}
