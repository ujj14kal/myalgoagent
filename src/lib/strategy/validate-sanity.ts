import type { BooleanSignalKind, ConditionNode } from "./types";

const FAMILY_LABEL: Record<BooleanSignalKind["family"], string> = {
  TIME_WINDOW: "time window",
  CANDLE_PATTERN: "candle pattern",
  CHART_PATTERN: "chart pattern",
  VOLUME_PATTERN: "volume pattern",
};

/**
 * Catches condition trees that are structurally impossible to ever fire —
 * e.g. two different time windows, or two different candle patterns, ANDed
 * together. A bar can only match ONE specific value of a given signal
 * family at a time, so requiring two different ones under AND is either a
 * dead condition (never true) or a mistake for OR. Only direct `signal`
 * children of an AND group are checked — nested groups have their own
 * AND/OR semantics and are validated independently when recursion reaches
 * them. OR groups are never restricted: "Doji OR Hammer OR Marubozu" as
 * alternative triggers is completely valid and common.
 */
export function validateConditionSanity(node: ConditionNode, path = "condition"): void {
  if (node.kind === "group") {
    if (node.op === "AND") {
      const seen = new Map<string, string>();
      for (const child of node.children) {
        if (child.kind !== "signal") continue;
        const family = child.signal.family;
        if (seen.has(family)) {
          throw new Error(
            `${path}: a strategy can't require two different ${FAMILY_LABEL[family]} conditions to both be true on the same bar — did you mean OR instead of AND?`,
          );
        }
        seen.set(family, family);
      }
    }
    node.children.forEach((c, idx) => validateConditionSanity(c, `${path}.children[${idx}]`));
    return;
  }

  if (node.kind === "not") {
    validateConditionSanity(node.child, `${path}.child`);
  }
}
