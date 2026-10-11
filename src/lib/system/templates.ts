import type { ConditionNode } from "@/lib/strategy/types";

// Blocks are made by describing them to Mr. Agent (there are no ready-made blocks). Editing a saved block starts from its own rule;
// this blank rule is only the placeholder an unsaved editor opens with.

/** A blank block: one AND group with a single rule to change. */
export const BLANK_BLOCK_CONDITION: ConditionNode = {
  kind: "group",
  op: "AND",
  children: [{ kind: "comparison", left: { kind: "price", field: "CLOSE" }, operator: "GT", right: { kind: "indicator", type: "SMA", params: [20] } }],
};
