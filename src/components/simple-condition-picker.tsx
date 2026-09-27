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

function defaultForCategory(category: ConditionCategory, purpose?: "entry" | "exit"): ConditionNode {
  switch (category) {
    case "INDICATOR":
      return defaultComparison();
    case "TIME":
      // Exit time defaults to 15:15 (true from then until the close).
      return purpose === "exit"
        ? { kind: "signal", signal: { family: "TIME_WINDOW", startMinute: 15 * 60 + 15, endMinute: 15 * 60 + 30 } }
        : defaultTimeWindow();
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
 * comparison/signal, or an AND/OR group of one or two of them ("Match both /
 * Match any"). Anything else (three or more, NOT, nested groups) needs
 * Advanced mode. */
export function fitsSimpleMode(node: ConditionNode): boolean {
  if (classifyCategory(node) !== null) return true;
  if (node.kind === "group" && node.children.length >= 1 && node.children.length <= 2) {
    return node.children.every((c) => classifyCategory(c) !== null);
  }
  return false;
}

/** Unwraps a tree that `fitsSimpleMode` into what Simple mode edits: a single
 * condition, or a two-condition group. */
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
  purpose,
}: {
  node: ConditionNode;
  onChange: (n: ConditionNode) => void;
  instruments: InstrumentOption[];
  /** Entry or exit section — changes how time conditions read ("Entry time" / "Exit time"). */
  purpose?: "entry" | "exit";
  categories?: ConditionCategory[];
}) {
  // Two conditions: "Match both" (AND) or "Match any" (OR).
  if (node.kind === "group" && node.children.length === 2) {
    const [first, second] = node.children;
    const setChild = (i: 0 | 1, child: ConditionNode) =>
      onChange({ ...node, children: i === 0 ? [child, second] : [first, child] });
    return (
      <div className="space-y-3">
        <SingleCondition node={first} onChange={(n) => setChild(0, n)} instruments={instruments} categories={categories} purpose={purpose} />
        <div className="flex items-center gap-2">
          <span className="h-px flex-1 bg-brand-navy/10" />
          <div className="flex overflow-hidden rounded-full border border-brand-navy/15">
            {(["AND", "OR"] as const).map((op) => (
              <button
                key={op}
                type="button"
                onClick={() => onChange({ ...node, op })}
                className={`px-3 py-1 text-xs font-semibold ${node.op === op ? "bg-brand-primary text-white" : "text-brand-navy/60 hover:bg-brand-bg"}`}
              >
                {op === "AND" ? "Match both" : "Match any"}
              </button>
            ))}
          </div>
          <span className="h-px flex-1 bg-brand-navy/10" />
        </div>
        <SingleCondition node={second} onChange={(n) => setChild(1, n)} instruments={instruments} categories={categories} purpose={purpose} />
        <button type="button" onClick={() => onChange(first)} className="text-xs font-medium text-brand-navy/50 hover:text-brand-sell">
          − Remove second condition
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <SingleCondition node={node} onChange={onChange} instruments={instruments} categories={categories} purpose={purpose} />
      <button
        type="button"
        onClick={() => onChange({ kind: "group", op: "AND", children: [node, defaultComparison()] })}
        className="text-xs font-semibold text-brand-primary hover:underline"
      >
        + Add condition
      </button>
    </div>
  );
}

/** One condition: pick its kind (indicator, time, pattern…), then configure it. */
function SingleCondition({
  node,
  onChange,
  instruments,
  categories,
  purpose,
}: {
  node: ConditionNode;
  onChange: (n: ConditionNode) => void;
  instruments: InstrumentOption[];
  categories: ConditionCategory[];
  purpose?: "entry" | "exit";
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
              if (cat !== active) onChange(defaultForCategory(cat, purpose));
            }}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
              cat === active
                ? "border-brand-primary bg-brand-primary text-white"
                : "border-brand-navy/15 text-brand-navy/60 hover:border-brand-primary"
            }`}
          >
            {cat === "TIME" && purpose ? (purpose === "entry" ? "Entry time" : "Exit time") : CATEGORY_LABEL[cat]}
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
          <SignalEditor node={node} onChange={onChange} onRemove={() => onChange(defaultForCategory(active, purpose))} purpose={purpose} />
        ) : (
          // Shouldn't happen (a group/not passed in) — fall back to the
          // full tree editor rather than showing nothing.
          <ConditionGroupEditor node={node} onChange={onChange} instruments={instruments} />
        )}
      </div>
    </div>
  );
}
