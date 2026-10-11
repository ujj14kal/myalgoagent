import "server-only";
import { prisma } from "@/lib/prisma";
import { parseBlockDefinition } from "./definition";
import type { SavedBlock } from "@/components/system/saved-blocks";

/** The user's saved blocks, ready to be offered in a strategy's rule editor (those that read as valid rules). */
export async function loadSavedBlocks(userId: string): Promise<SavedBlock[]> {
  const rows = await prisma.block.findMany({ where: { userId }, orderBy: { name: "asc" }, take: 100, select: { id: true, name: true, definition: true } });
  return rows.flatMap((r) => {
    const def = parseBlockDefinition(r.definition);
    return def ? [{ id: r.id, name: r.name, condition: def.condition, timeframe: def.timeframe ?? null }] : [];
  });
}
