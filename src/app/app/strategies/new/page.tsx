import { prisma } from "@/lib/prisma";
import StrategyBuilderForm from "@/components/strategy-builder-form";
import { Layers } from "lucide-react";
import PageHeader from "@/components/ui/page-header";

export const metadata = { title: "New Strategy", robots: { index: false } };

export default async function NewStrategyPage() {
  const instruments = await prisma.instrument.findMany({
    orderBy: { symbol: "asc" },
    select: { id: true, symbol: true, name: true },
  });

  return (
    <div>
      <PageHeader title="New Strategy" icon={Layers} description={<>Build your entry and exit rules visually, or write them as code — both are evaluated identically.</>} />
      <div className="mt-6">
        <StrategyBuilderForm instruments={instruments} />
      </div>
    </div>
  );
}
