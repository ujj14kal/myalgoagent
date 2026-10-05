import { toConditionNode } from "./conditions";
import { CONNECTIONS, type Connection, type LogicNode } from "@/lib/workspace/types";
import { LIMITS } from "@/lib/workspace/definition";
import type { ConditionNode } from "@/lib/strategy/types";

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/**
 * The agent's logic tree → a workspace's logic. Three shapes of node:
 *   { "strategy": "<name or letter>", "rule": "entry" | "exit" }
 *   { "condition": <a rule, as in CONDITIONS>, "label": "<optional name>" }
 *   { "connection": "AND|OR|SEQUENCE|CONFIRMATION|VETO|DEPENDENCY", "bars": <candles>, "children": [ ...nodes ] }
 * `memberOf` turns a strategy reference into the letter it has in the workspace (or null when it isn't one of them).
 * Throws a readable error naming the node. A bare list of nodes is read as an AND group.
 */
export function logicFrom(raw: unknown, memberOf: (ref: string) => string | null, path = "logic"): LogicNode {
  const budget = { n: 0 };
  const walk = (v: unknown, where: string, depth: number): LogicNode => {
    if (depth > LIMITS.depth) throw new Error(`${where}: nested too deeply (at most ${LIMITS.depth} levels).`);
    if (++budget.n > LIMITS.nodes) throw new Error(`${where}: too many rules (at most ${LIMITS.nodes}).`);
    if (Array.isArray(v)) return walk({ connection: "AND", children: v }, where, depth);
    if (!isObj(v)) throw new Error(`${where}: expected an object with "strategy", "condition" or "connection".`);
    if (typeof v.strategy === "string") {
      const member = memberOf(v.strategy);
      if (!member) throw new Error(`${where}: "${v.strategy}" isn't one of the workspace's strategies. List it in "strategies" first.`);
      const rule = String(v.rule ?? "entry").toLowerCase();
      if (rule !== "entry" && rule !== "exit") throw new Error(`${where}: rule must be "entry" or "exit".`);
      return { type: "strategy", member, rule: rule === "exit" ? "EXIT" : "ENTRY" };
    }
    if (v.condition !== undefined) {
      const condition: ConditionNode = toConditionNode(v.condition, `${where}.condition`);
      return { type: "rule", condition, ...(typeof v.label === "string" ? { label: v.label.slice(0, 60) } : {}) };
    }
    if (typeof v.connection === "string") {
      const connection = v.connection.toUpperCase() as Connection;
      if (!CONNECTIONS.includes(connection)) throw new Error(`${where}: connection must be one of ${CONNECTIONS.join(", ")}.`);
      if (!Array.isArray(v.children) || v.children.length === 0) throw new Error(`${where}: a group needs a non-empty "children" list.`);
      const bars = typeof v.bars === "number" && Number.isFinite(v.bars) ? Math.floor(v.bars) : undefined;
      return {
        type: "group",
        connection,
        ...(bars !== undefined ? { bars } : {}),
        children: v.children.map((c, i) => walk(c, `${where} › ${connection.toLowerCase()} #${i + 1}`, depth + 1)),
        ...(typeof v.label === "string" ? { label: v.label.slice(0, 60) } : {}),
      };
    }
    throw new Error(`${where}: each node needs "strategy", "condition" or "connection".`);
  };
  return walk(raw, path, 0);
}
