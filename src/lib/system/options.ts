import "server-only";
import { prisma } from "@/lib/prisma";
import { conditionToText } from "@/lib/strategy/format";
import { describeConcept } from "./compile";
import { conceptBlockIds, parseBlockDefinition, parseConceptClass, parseConceptDefinition } from "./definition";

const text = (f: () => string) => {
  try {
    return f();
  } catch {
    return "";
  }
};

/** The user's blocks as the Concept Builder lists them: name and the rule in words. */
export async function loadBlockOptions(userId: string) {
  const rows = await prisma.block.findMany({ where: { userId }, orderBy: { name: "asc" }, take: 500 });
  return rows.map((b) => {
    const def = parseBlockDefinition(b.definition);
    return { id: b.id, name: b.name, text: def ? text(() => conditionToText(def.condition)) : "" };
  });
}

/** The user's concepts as the Trading System Builder lists them: name, side and the setup in words. */
export async function loadConceptOptions(userId: string) {
  const rows = await prisma.concept.findMany({ where: { userId }, orderBy: { name: "asc" }, take: 500 });
  const defs = rows.map((r) => parseConceptDefinition(r.definition));
  const ids = [...new Set(defs.flatMap((d) => conceptBlockIds(d?.logic ?? null)))];
  const blocks = ids.length ? await prisma.block.findMany({ where: { userId, id: { in: ids } }, select: { id: true, name: true } }) : [];
  const names = Object.fromEntries(blocks.map((b) => [b.id, { name: b.name }]));
  return rows.map((c, i) => ({ id: c.id, name: c.name, classification: parseConceptClass(c.classification), text: defs[i] ? describeConcept(defs[i]!, names) : "" }));
}
