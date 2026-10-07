import { CONNECTIONS, type Connection } from "@/lib/workspace/types";
import { SYSTEM_LIMITS } from "@/lib/system/definition";
import type { ConceptNode } from "@/lib/system/types";

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/** The agent's concept tree → a concept's logic. `blockOf` resolves a block name to its id (or a "new:" id). */
export function conceptLogicFrom(raw: unknown, blockOf: (ref: string) => string | null): ConceptNode {
  const budget = { n: 0 };
  const walk = (v: unknown, where: string, depth: number): ConceptNode => {
    if (depth > SYSTEM_LIMITS.depth) throw new Error(`${where}: nested too deeply (at most ${SYSTEM_LIMITS.depth} levels).`);
    if (++budget.n > SYSTEM_LIMITS.conceptNodes) throw new Error(`${where}: too many parts.`);
    if (Array.isArray(v)) return walk({ connection: "AND", children: v }, where, depth);
    if (typeof v === "string") return walk({ block: v }, where, depth);
    if (!isObj(v)) throw new Error(`${where}: expected {"block": …} or {"connection": …}.`);
    if (typeof v.block === "string") {
      const id = blockOf(v.block);
      if (!id) throw new Error(`${where}: the user has no block "${v.block}". Use an exact name from get_my_workspace, or add it to new_blocks.`);
      return { type: "block", blockId: id, ...(v.optional === true ? { optional: true } : {}) };
    }
    if (typeof v.connection === "string") {
      const connection = v.connection.toUpperCase() as Connection;
      if (!CONNECTIONS.includes(connection)) throw new Error(`${where}: connection must be one of ${CONNECTIONS.join(", ")}.`);
      if (!Array.isArray(v.children) || v.children.length === 0) throw new Error(`${where}: a group needs a non-empty "children" list.`);
      const bars = num(v.bars);
      return { type: "group", connection, ...(bars !== undefined ? { bars: Math.floor(bars) } : {}), children: v.children.map((c, i) => walk(c, `${where} › ${connection.toLowerCase()} #${i + 1}`, depth + 1)) };
    }
    throw new Error(`${where}: each part needs "block" or "connection".`);
  };
  return walk(raw, "logic", 0);
}

