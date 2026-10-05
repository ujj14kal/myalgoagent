import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import StrategyBuilderForm from "@/components/strategy-builder-form";

// Development only: the strategy builder without signing in, so its screens can be checked.
// Saving does nothing here (the save actions need a signed-in user). Not served in production.

export const dynamic = "force-dynamic";

export default async function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  const instruments = await prisma.instrument.findMany({ where: { symbol: { in: ["RELIANCE.NS", "TCS.NS", "INFY.NS", "HDFCBANK.NS"] } }, select: { id: true, symbol: true, name: true }, orderBy: { symbol: "asc" } });
  return (
    <main className="mx-auto max-w-5xl p-4">
      <StrategyBuilderForm instruments={instruments} />
    </main>
  );
}
