"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/logger";
import type { AgentProposal } from "@/lib/ai/proposals";
import { blockDemo, conceptDemo, indicatorDemo, type DemoBlockPart, type DemoData } from "@/lib/demo/proposal-demo";
import { compileConcept } from "@/lib/system/compile";
import { conceptBlockIds, parseBlockDefinition } from "@/lib/system/definition";
import type { BlockDefinition } from "@/lib/system/types";

// "How it would look" for a block, indicator or concept the assistant has prepared — drawn on a made-up ₹1,000 stock
// before the user confirms anything. Read-only: nothing is saved.

export type DemoResult = { ok: true; demo: DemoData } | { ok: false; error: string };

export async function proposalDemo(proposal: AgentProposal): Promise<DemoResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "Sign in again." };
  try {
    if (proposal.kind === "block") return { ok: true, demo: blockDemo(proposal.draft.name, proposal.draft.definition.condition) };
    if (proposal.kind === "indicator") return { ok: true, demo: indicatorDemo(proposal.draft.name, proposal.draft.def) };
    if (proposal.kind === "concept") {
      const d = proposal.draft;
      // The blocks it uses: new ones come with the proposal, existing ones are the user's own.
      const blocks: Record<string, { name: string; definition: BlockDefinition }> = {};
      for (const nb of d.newBlocks) blocks[`new:${nb.name}`] = { name: nb.name, definition: nb.definition };
      const existing = conceptBlockIds(d.definition.logic).filter((id) => !id.startsWith("new:"));
      if (existing.length) {
        const rows = await prisma.block.findMany({ where: { userId, id: { in: existing } }, select: { id: true, name: true, definition: true } });
        for (const r of rows) {
          const def = parseBlockDefinition(r.definition);
          if (def) blocks[r.id] = { name: r.name, definition: def };
        }
      }
      const { runtime, issues } = compileConcept({ id: "demo", name: d.name, classification: d.classification, definition: d.definition, blocks });
      if (!runtime) return { ok: false, error: issues[0]?.message ?? "This concept can't be drawn yet." };
      const parts: DemoBlockPart[] = Object.values(blocks).map((b) => ({ name: b.name, condition: b.definition.condition }));
      return { ok: true, demo: conceptDemo(d.name, runtime.condition, parts) };
    }
    return { ok: false, error: "There is no demo for this kind of request." };
  } catch (err) {
    logError("proposal-demo", err, { userId, kind: proposal.kind });
    return { ok: false, error: "Couldn't draw the demo just now. You can still review and create it." };
  }
}
