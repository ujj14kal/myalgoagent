import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import WorkspaceEditor from "@/components/workspace/workspace-editor";
import { emptyDefinition } from "@/lib/workspace/definition";

// Development only: the workspace editor without signing in, with made-up strategies, so its screens can be checked.
// Saving and checking do nothing here (those need a signed-in user). Not served in production.

export const dynamic = "force-dynamic";

export default async function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  const instruments = await prisma.instrument.findMany({ where: { symbol: { in: ["RELIANCE.NS", "TCS.NS", "INFY.NS"] } }, select: { id: true, symbol: true, name: true }, orderBy: { symbol: "asc" } });
  const draft = { ...emptyDefinition(instruments[0]?.id ?? ""), members: [{ id: "A", strategyId: "s1" }, { id: "B", strategyId: "s2" }] };
  return (
    <main className="mx-auto max-w-5xl p-4">
      <WorkspaceEditor
        id="dev"
        initialName="Trend + dip entries"
        initialDescription=""
        initialDraft={draft}
        latestVersion={0}
        archived={false}
        instruments={instruments}
        strategies={[
          { id: "s1", name: "EMA 20/50 crossover", direction: "LONG", symbol: "RELIANCE", timeframe: "1d", mode: "NO_CODE" },
          { id: "s2", name: "RSI dip buyer", direction: "LONG", symbol: "RELIANCE", timeframe: "1d", mode: "NO_CODE" },
          { id: "s3", name: "Breakout", direction: "SHORT", symbol: "TCS", timeframe: "15m", mode: "CODE" },
        ]}
      />
    </main>
  );
}
