import Link from "next/link";
import { notFound } from "next/navigation";
import { Network } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/ui/page-header";
import Pager from "@/components/ui/pager";
import SystemEditor from "@/components/system/system-editor";
import WorkspaceActionsBar from "@/components/workspace/workspace-actions-bar";
import { pageWindow, readPageQuery } from "@/lib/pagination";
import { parseSystemDefinition } from "@/lib/system/definition";
import { loadConceptOptions } from "@/lib/system/options";

export const metadata = { title: "Trading system", robots: { index: false } };
export const dynamic = "force-dynamic";

const VERSIONS_PER_PAGE = 10;
const STATUS_LABEL: Record<string, string> = { ACTIVE: "Live", PAUSED: "Paused" };

export default async function TradingSystemPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  const { id } = await params;
  const sp = await searchParams;
  const ws = await prisma.workspace.findFirst({ where: { id, userId } });
  if (!ws) notFound();
  const draft = parseSystemDefinition(ws.draft);
  if (!draft) notFound();

  const [instruments, concepts, versionTotal] = await Promise.all([
    prisma.instrument.findMany({ orderBy: { symbol: "asc" }, select: { id: true, symbol: true, name: true } }),
    loadConceptOptions(userId),
    prisma.workspaceVersion.count({ where: { workspaceId: id } }),
  ]);
  const { page, size } = readPageQuery(sp, VERSIONS_PER_PAGE);
  const win = pageWindow(versionTotal, page, size);
  const versions = await prisma.workspaceVersion.findMany({
    where: { workspaceId: id },
    orderBy: { version: "desc" },
    skip: win.skip,
    take: win.take,
    include: {
      strategy: {
        select: { id: true, name: true, _count: { select: { backtestRuns: true, paperSessions: true } }, liveDeployments: { where: { status: { in: ["ACTIVE", "PAUSED"] } }, select: { status: true, broker: true } } },
      },
    },
  });
  const when = (d: Date) => d.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

  return (
    <div>
      <PageHeader
        eyebrow={`Workspace · Trading system · ${ws.status === "ARCHIVED" ? "archived" : ws.latestVersion > 0 ? `version ${ws.latestVersion} published` : "draft"}`}
        title={ws.name}
        icon={Network}
        description="Every trading decision lives here; the setups come from your concepts. Nothing changes for a running version until you publish a new one."
        actions={<WorkspaceActionsBar id={ws.id} archived={ws.status === "ARCHIVED"} />}
      />
      <SystemEditor
        id={ws.id}
        initialName={ws.name}
        initialDescription={ws.description ?? ""}
        initialDraft={draft}
        latestVersion={ws.latestVersion}
        archived={ws.status === "ARCHIVED"}
        concepts={concepts}
        instruments={instruments}
      />

      <section className="mx-auto mt-8 max-w-4xl">
        <h2 className="text-sm font-semibold text-brand-navy">Published versions</h2>
        <p className="mt-0.5 text-xs text-brand-navy/50">Each version is a frozen copy of the system, its concepts and blocks, and the strategy it produced. Backtest it, forward test it, then take it live from its strategy page.</p>
        {versions.length === 0 ? (
          <p className="surface mt-3 p-5 text-center text-sm text-brand-navy/50">Nothing published yet. When the system checks out, publish version 1.</p>
        ) : (
          <div className="mt-3 overflow-x-auto surface">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Version</th>
                  <th>Published</th>
                  <th>Note</th>
                  <th className="num-cell">Backtests</th>
                  <th className="num-cell">Forward tests</th>
                  <th>Live</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {versions.map((v) => (
                  <tr key={v.id}>
                    <td className="font-semibold">v{v.version}</td>
                    <td className="text-brand-navy/60">{when(v.createdAt)}</td>
                    <td className="max-w-[16rem] truncate text-brand-navy/60">{v.note ?? "—"}</td>
                    <td className="num-cell">{v.strategy?._count.backtestRuns ?? 0}</td>
                    <td className="num-cell">{v.strategy?._count.paperSessions ?? 0}</td>
                    <td>{v.strategy && v.strategy.liveDeployments.length > 0 ? v.strategy.liveDeployments.map((d) => STATUS_LABEL[d.status] ?? d.status).join(", ") : "—"}</td>
                    <td className="text-right">{v.strategy ? <Link href={`/app/strategies/${v.strategy.id}`} className="font-semibold text-brand-primary hover:underline">Open strategy →</Link> : <span className="text-xs text-brand-navy/40">strategy removed</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager basePath={`/app/workspaces/${id}`} params={{}} window={win} />
      </section>
    </div>
  );
}
