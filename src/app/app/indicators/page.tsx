import { PencilRuler } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/ui/page-header";
import CustomIndicatorList from "@/components/custom-indicators/list";
import { describeCustom, type CustomIndicatorDef } from "@/lib/custom-indicator";

export const metadata = { title: "Custom Indicators", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const prefill = sp.formula ? { name: (sp.name ?? "").slice(0, 60), formula: sp.formula.slice(0, 500), pane: sp.pane === "price" ? ("price" as const) : ("separate" as const), description: sp.description?.slice(0, 300) ?? null } : null;
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
        description="Your own indicators: write a formula from prices and indicators, or draw a trendline or level on any chart and save it with a name. They appear under “Custom” in every indicator picker — on charts, in strategy rules, backtests, forward tests and the replay — always with their formula shown."
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
