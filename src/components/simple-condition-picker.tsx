"use client";

import type { ConditionNode } from "@/lib/strategy";
import ConditionGroupEditor, {
  ComparisonEditor,
  SignalEditor,
  defaultComparison,
  defaultTimeWindow,
  defaultCandlePattern,
  defaultChartPattern,
  defaultVolumePattern,
  type InstrumentOption,
} from "@/components/condition-group-editor";

export type ConditionCategory = "INDICATOR" | "TIME" | "CANDLE_PATTERN" | "CHART_PATTERN" | "VOLUME_PATTERN";

export const ALL_CATEGORIES: ConditionCategory[] = ["INDICATOR", "TIME", "CANDLE_PATTERN", "CHART_PATTERN", "VOLUME_PATTERN"];

const CATEGORY_LABEL: Record<ConditionCategory, string> = {
  INDICATOR: "Indicators",
  TIME: "Time",
  CANDLE_PATTERN: "Candle Patterns",
  CHART_PATTERN: "Chart Patterns",
  VOLUME_PATTERN: "Volume",
};

function defaultForCategory(category: ConditionCategory): ConditionNode {
  switch (category) {
    case "INDICATOR":
      return defaultComparison();
    case "TIME":
      return defaultTimeWindow();
    case "CANDLE_PATTERN":
      return defaultCandlePattern();
    case "CHART_PATTERN":
      return defaultChartPattern();
    case "VOLUME_PATTERN":
      return defaultVolumePattern();
  }
}

/** Which category a single (non-group) condition node belongs to — used
 * both to highlight the active tab and to decide what "Advanced" mode's
 * tree should collapse back down to, if it ever cleanly can. */
export function classifyCategory(node: ConditionNode): ConditionCategory | null {
  if (node.kind === "comparison") return "INDICATOR";
  if (node.kind === "signal") {
    switch (node.signal.family) {
      case "TIME_WINDOW":
        return "TIME";
      case "CANDLE_PATTERN":
        return "CANDLE_PATTERN";
      case "CHART_PATTERN":
        return "CHART_PATTERN";
      case "VOLUME_PATTERN":
        return "VOLUME_PATTERN";
    }
  }
  return null;
}

/** True when a saved condition tree fits the Simple-mode shape: a bare
 * comparison/signal, or a single-child AND/OR group wrapping one. Anything
 * else (multiple children, NOT, nested groups) needs Advanced mode. */
export function fitsSimpleMode(node: ConditionNode): boolean {
  if (classifyCategory(node) !== null) return true;
  if (node.kind === "group" && node.children.length === 1) return classifyCategory(node.children[0]) !== null;
  return false;
}

/** Unwraps a tree that `fitsSimpleMode` into the single node Simple mode
 * edits directly. */
export function unwrapForSimpleMode(node: ConditionNode): ConditionNode {
  if (node.kind === "group" && node.children.length === 1) return node.children[0];
  return node;
}

/**
 * The guided, category-first way to build one entry/exit trigger: pick what
 * *kind* of condition this is (an indicator comparison, a time window, a
 * pattern), then configure just that one thing. This is deliberately
 * restricted to a single condition — the "what can't exist together" bug
 * (e.g. two different time windows ANDed, which can never both be true on
 * one bar) can't occur here at all, only in Advanced mode's free-form tree.
 */
export default function SimpleConditionPicker({
  node,
  onChange,
  instruments,
  categories = ALL_CATEGORIES,
}: {
  node: ConditionNode;
  onChange: (n: ConditionNode) => void;
  instruments: InstrumentOption[];
  categories?: ConditionCategory[];
}) {
  const active = classifyCategory(node) ?? "INDICATOR";

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => {
              if (cat !== active) onChange(defaultForCategory(cat));
            }}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
              cat === active
                ? "border-brand-primary bg-brand-primary text-white"
                : "border-brand-navy/15 text-brand-navy/60 hover:border-brand-primary"
            }`}
          >
            {CATEGORY_LABEL[cat]}
          </button>
        ))}
      </div>

      <div className="mt-3">
        {node.kind === "comparison" ? (
          <ComparisonEditor
            node={node}
            onChange={onChange}
            onRemove={() => onChange(defaultComparison())}
            instruments={instruments}
          />
        ) : node.kind === "signal" ? (
          <SignalEditor node={node} onChange={onChange} onRemove={() => onChange(defaultForCategory(active))} />
        ) : (
          // Shouldn't happen (a group/not passed in) — fall back to the
          // full tree editor rather than showing nothing.
          <ConditionGroupEditor node={node} onChange={onChange} instruments={instruments} />
        )}
      </div>
    </div>
  );
}
