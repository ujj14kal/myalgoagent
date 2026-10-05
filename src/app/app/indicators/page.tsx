import { PencilRuler } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/ui/page-header";
import CustomIndicatorList from "@/components/custom-indicators/list";
import { describeCustom, validateCustomDef, type CustomIndicatorDef } from "@/lib/custom-indicator";
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
  const [items, instruments] = await Promise.all([
    prisma.customIndicator.findMany({ where: { userId }, orderBy: { updatedAt: "desc" } }),
    prisma.instrument.findMany({ orderBy: { symbol: "asc" }, select: { id: true, symbol: true, name: true } }),
  ]);
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
          items={items.map((i) => {
            const def = i.def as unknown as CustomIndicatorDef;
            return { id: i.id, name: i.name, description: i.description, def, summary: describeCustom(def) };
          })}
        />
      </div>
    </div>
  );
}
