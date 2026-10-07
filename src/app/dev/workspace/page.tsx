import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import BlockEditor from "@/components/system/block-editor";
import ConceptEditor from "@/components/system/concept-editor";
import SystemEditor from "@/components/system/system-editor";
import { emptySystem } from "@/lib/system/definition";

// Development only: the three workspace builders without signing in, with made-up blocks and concepts, so their
// screens can be checked. Saving and checking do nothing here (those need a signed-in user). Not served in production.
// ?layer=block | concept | system (default).

export const dynamic = "force-dynamic";

const BLOCKS = [
  { id: "b1", name: "My liquidity sweep", text: "Bullish liquidity sweep (swing 3)" },
  { id: "b2", name: "My BOS", text: "Bullish break of structure (swing 3)" },
  { id: "b3", name: "My FVG", text: "Bullish fair value gap" },
  { id: "b4", name: "My FVG retest", text: "Bullish FVG retest" },
  { id: "b5", name: "HTF trend up", text: "Close > EMA(50)" },
];

export default async function Page({ searchParams }: { searchParams: Promise<{ layer?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { layer } = await searchParams;
  const instruments = await prisma.instrument.findMany({ where: { symbol: { in: ["RELIANCE.NS", "TCS.NS", "INFY.NS"] } }, select: { id: true, symbol: true, name: true }, orderBy: { symbol: "asc" } });
  return (
    <main className="mx-auto max-w-5xl p-4">
      {layer === "block" ? (
        <BlockEditor />
      ) : layer === "concept" ? (
        <ConceptEditor
          blocks={BLOCKS}
          initialName="My Bullish SMC Entry"
          initialLogic={{ type: "group", connection: "SEQUENCE", bars: 10, children: [{ type: "block", blockId: "b1" }, { type: "block", blockId: "b2" }, { type: "block", blockId: "b3" }, { type: "block", blockId: "b4" }, { type: "block", blockId: "b5", optional: true, timeframe: "higher" }] }}
        />
      ) : (
        <SystemEditor
          id="dev"
          initialName="Nifty SMC intraday"
          initialDescription=""
          initialDraft={{ ...emptySystem(instruments[0]?.id ?? ""), concepts: [{ conceptId: "c1", enabled: true }, { conceptId: "c2", enabled: true }], timeframes: { primary: "5m", confirmation: "15m", higher: "60m" } }}
          latestVersion={0}
          archived={false}
          instruments={instruments}
          concepts={[
            { id: "c1", name: "My Bullish SMC Entry", classification: "BULLISH", text: "My liquidity sweep → My BOS → My FVG → My FVG retest (each within 10 candles)" },
            { id: "c2", name: "My Bearish Reversal", classification: "BEARISH", text: "Bearish BOS, confirmed by Bearish FVG within 3 candles" },
            { id: "c3", name: "Opening range breakout", classification: "BULLISH", text: "Close crosses above the 09:30 high" },
          ]}
        />
      )}
    </main>
  );
}
