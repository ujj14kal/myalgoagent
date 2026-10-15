import Link from "next/link";
import { PencilRuler } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/ui/page-header";
import CustomIndicatorList from "@/components/custom-indicators/list";
import DatasetsPanel from "@/components/custom-indicators/datasets";
import { classifyCustom, CUSTOM_CLASSES, describeCustom, type CustomClass, type CustomIndicatorDef } from "@/lib/custom-indicator";
import Pager from "@/components/ui/pager";
import type { IndicatorVersion } from "@/lib/custom-indicator-actions";
import { readPageQuery } from "@/lib/pagination";
import { keepParams, pageRows, qEnum, qText } from "@/lib/list-query";

export const metadata = { title: "Custom Indicators", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  // At most 100 per user, and the class comes from each definition — so they're filtered and paged
  // here on the server, and only the page shown goes to the browser.
  const kind = qEnum(sp.kind, ["all", ...CUSTOM_CLASSES] as const, "all");
  const q = qText(sp.q)?.toLowerCase();
  const sort = qEnum(sp.sort, ["updated", "name", "created"] as const, "updated");
  const col = qText(sp.col, 30) ?? null;
  const datasetRows = (await prisma.userDataset.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, select: { id: true, name: true, slug: true, description: true, rows: true, times: true } })).map((d) => {
    const t = d.times as unknown as number[];
    return { id: d.id, name: d.name, slug: d.slug, description: d.description, rows: d.rows, from: t[0], to: t[t.length - 1] };
  });
  const items = await prisma.customIndicator.findMany({ where: { userId }, orderBy: sort === "name" ? { name: "asc" } : sort === "created" ? { createdAt: "desc" } : { updatedAt: "desc" } });
  const published = new Set((await prisma.communityIndicator.findMany({ where: { authorId: userId }, select: { name: true } })).map((p) => p.name));
  const collections = [...new Set(items.flatMap((i) => (i.collection ? [i.collection] : [])))].sort();
  const all = items.map((i) => {
    const def = i.def as unknown as CustomIndicatorDef;
    return { id: i.id, name: i.name, description: i.description, def, summary: describeCustom(def), collection: i.collection, published: published.has(i.name), history: Array.isArray(i.history) ? (i.history as unknown as IndicatorVersion[]) : [] };
  });
  const searched = all.filter((i) => (!q || `${i.name} ${i.description ?? ""} ${i.summary}`.toLowerCase().includes(q)) && (!col || (col === "(none)" ? !i.collection : i.collection === col)));
  const counts = Object.fromEntries(CUSTOM_CLASSES.map((c) => [c, searched.filter((i) => classifyCustom(i.def) === c).length])) as Record<CustomClass, number>;
  const { page, size } = readPageQuery(sp, 10);
  const shown = pageRows(searched.filter((i) => kind === "all" || classifyCustom(i.def) === kind), page, size);
  const params = keepParams({ q: qText(sp.q), kind: kind === "all" ? undefined : kind, sort: sort === "updated" ? undefined : sort, col: col ?? undefined, size: size === 10 ? undefined : String(size) });

  return (
    <div>
      <PageHeader
        title="Custom Indicators"
        icon={PencilRuler}
        description="Describe an indicator in your own words, wire blocks together or write the formula, and test it on real candles before you save it. Saved indicators appear under “Custom” in every indicator picker: on charts, in strategy rules, backtests, forward tests and the replay, always with their formula shown."
        actions={
          <span className="flex items-center gap-3 text-xs font-semibold">
            <Link href="/app/indicators/guide" className="text-brand-primary hover:underline">Language guide</Link>
            <Link href="/app/indicators/library" className="text-brand-primary hover:underline">Library</Link>
          </span>
        }
      />
      <div className="mt-6 space-y-6">
        <DatasetsPanel datasets={datasetRows} />
        <CustomIndicatorList
          items={shown.rows}
          total={all.length}
          counts={counts}
          kind={kind}
          collections={collections}
          params={params}
          pager={<Pager basePath="/app/indicators" params={params} window={shown.win} />}
        />
      </div>
    </div>
  );
}
