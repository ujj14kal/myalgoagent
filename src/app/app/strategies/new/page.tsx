import { prisma } from "@/lib/prisma";
import StrategyBuilderForm from "@/components/strategy-builder-form";

export const metadata = { title: "New Strategy", robots: { index: false } };

export default async function NewStrategyPage() {
  const instruments = await prisma.instrument.findMany({
    orderBy: { symbol: "asc" },
    select: { id: true, symbol: true, name: true },
  });

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-navy">New Strategy</h1>
      <p className="mt-2 text-sm text-brand-navy/60">
        Build your entry and exit rules visually, or write them as code —
        both are evaluated identically.
      </p>
      <div className="mt-6 max-w-3xl">
        <StrategyBuilderForm instruments={instruments} />
      </div>
    </div>
  );
}
