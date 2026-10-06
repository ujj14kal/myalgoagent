import { PencilRuler } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/ui/page-header";
import CustomIndicatorList from "@/components/custom-indicators/list";
import { classifyCustom, CUSTOM_CLASSES, describeCustom, validateCustomDef, type CustomClass, type CustomIndicatorDef } from "@/lib/custom-indicator";
import Pager from "@/components/ui/pager";
import { readPageQuery } from "@/lib/pagination";
import { keepParams, pageRows, qEnum, qText } from "@/lib/list-query";
import { draftDefFrom } from "@/lib/ai/custom-indicator-arg";

/** A draft from the assistant's link: ?formula=…&pane=… for a formula, or ?kind=zone&upper=…&lower=… (see draftParams) for any kind. */
function prefillFrom(sp: Record<string, string | undefined>) {
  let def: CustomIndicatorDef | null = null;
  try {
    if (sp.kind) def = draftDefFrom(Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, v?.slice(0, 500)])));
    else if (sp.formula) def = validateCustomDef({ type: "formula", formula: sp.formula.slice(0, 500), pane: sp.pane === "price" ? "price" : "separate" });
  } catch {
    return null; // a broken link just opens the empty builder
  }
  return def ? { name: (sp.name ?? "").slice(0, 60), description: sp.description?.slice(0, 300) ?? null, def } : null;
}

export const metadata = { title: "Custom Indicators", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const prefill = prefillFrom(sp);
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  // At most 100 per user, and the class comes from each definition — so they're filtered and paged
  // here on the server, and only the page shown goes to the browser.
  const kind = qEnum(sp.kind, ["all", ...CUSTOM_CLASSES] as const, "all");
  const q = qText(sp.q)?.toLowerCase();
  const sort = qEnum(sp.sort, ["updated", "name", "created"] as const, "updated");
  const [items, instruments] = await Promise.all([
    prisma.customIndicator.findMany({ where: { userId }, orderBy: sort === "name" ? { name: "asc" } : sort === "created" ? { createdAt: "desc" } : { updatedAt: "desc" } }),
    prisma.instrument.findMany({ orderBy: { symbol: "asc" }, select: { id: true, symbol: true, name: true } }),
  ]);
  const all = items.map((i) => {
    const def = i.def as unknown as CustomIndicatorDef;
    return { id: i.id, name: i.name, description: i.description, def, summary: describeCustom(def) };
  });
  const searched = all.filter((i) => !q || `${i.name} ${i.description ?? ""} ${i.summary}`.toLowerCase().includes(q));
  const counts = Object.fromEntries(CUSTOM_CLASSES.map((c) => [c, searched.filter((i) => classifyCustom(i.def) === c).length])) as Record<CustomClass, number>;
  const { page, size } = readPageQuery(sp, 10);
  const shown = pageRows(searched.filter((i) => kind === "all" || classifyCustom(i.def) === kind), page, size);
  const params = keepParams({ q: qText(sp.q), kind: kind === "all" ? undefined : kind, sort: sort === "updated" ? undefined : sort, size: size === 10 ? undefined : String(size) });

  return (
    <div>
      <PageHeader
        title="Custom Indicators"
        icon={PencilRuler}
        description="Your own indicators: graph lines and price overlays from a formula, signal markers, channels, bands, levels, zones and rectangles — or draw a trendline, channel, level or zone on any chart and save it with a name. They appear under “Custom” in every indicator picker — on charts, in strategy rules, backtests, forward tests and the replay — always with their formula shown."
      />
      <div className="mt-6">
        <CustomIndicatorList
          instruments={instruments}
          prefill={prefill}
          items={shown.rows}
          total={all.length}
          counts={counts}
          kind={kind}
          params={params}
          pager={<Pager basePath="/app/indicators" params={params} window={shown.win} />}
        />
      </div>
    </div>
  );
}
