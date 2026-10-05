import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import StrategyBuilderForm from "@/components/strategy-builder-form";
import CustomIndicatorsRoot from "@/components/custom-indicators/root";

// Development only: the strategy builder without signing in, so its screens can be checked.
// Saving does nothing here (the save actions need a signed-in user). Not served in production.

export const dynamic = "force-dynamic";

export default async function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  const instruments = await prisma.instrument.findMany({ where: { symbol: { in: ["RELIANCE.NS", "TCS.NS", "INFY.NS", "HDFCBANK.NS"] } }, select: { id: true, symbol: true, name: true }, orderBy: { symbol: "asc" } });
  return (
    <main className="mx-auto max-w-5xl p-4">
      {/* Two sample custom indicators so the rule pickers' Custom group can be checked. */}
      <CustomIndicatorsRoot items={[{ name: "Demand zone", def: { type: "zone", upper: 1250, lower: 1200 } }, { name: "Trend strength", def: { type: "formula", formula: "(close - sma(close, 50)) / atr(14)", pane: "separate" } }]}>
        <StrategyBuilderForm instruments={instruments} />
      </CustomIndicatorsRoot>
    </main>
  );
}
