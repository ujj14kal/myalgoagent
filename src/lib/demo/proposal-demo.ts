import type { Candle } from "@/lib/market-data";
import type { ConditionNode, Signal } from "@/lib/strategy/types";
import { conditionTruthPerBar } from "@/lib/strategy/evaluate";
import { conditionToText } from "@/lib/strategy/format";
import { classifyCustom, customVisual, describeCustom, type CustomIndicatorDef } from "@/lib/custom-indicator";
import { DEMO_BASE, bestSeed, risingEdges, sampleCandles } from "./sample-chart";

// "Here is how it would look": a block, an indicator or a whole concept drawn on a made-up stock that starts at ₹1,000,
// before anything is created. Pure, so it runs on the server for the review window and is easy to test. The real rule
// engine does the work — the prices are invented, the signals are not.

export type DemoLine = { label: string; color: string; dashed?: boolean; points: { time: number; value: number }[] };
export type DemoNote = { time: number; text: string; color: string };

export type DemoData = {
  kind: "block" | "indicator" | "concept";
  title: string;
  candles: Candle[];
  /** Trade-style markers (unused by these demos, which label with notes instead). */
  markers: Signal[];
  notes: DemoNote[];
  /** Lines on the price chart (an indicator drawn over the candles). */
  overlays: DemoLine[];
  /** Lines in a pane under the chart (an indicator measured on its own scale). */
  lower: DemoLine[];
  hits: number;
  /** What to look at, in plain words — one line each. */
  lines: string[];
};

const COLORS = ["#2563eb", "#0d9488", "#db2777", "#ea580c", "#7c3aed", "#0891b2"];

/** The same rule with every "read this on another chart / another stock" removed — a demo has one made-up chart. */
export function singleChart(node: ConditionNode): ConditionNode {
  switch (node.kind) {
    case "group":
      return { ...node, children: node.children.map(singleChart) };
    case "not":
    case "recent":
      return { ...node, child: singleChart(node.child) };
    case "comparison": {
      const op = (o: typeof node.left) => (o.kind === "constant" ? o : ({ ...o, timeframe: undefined, instrumentSymbol: undefined } as typeof o));
      return { ...node, left: op(node.left), right: op(node.right) };
    }
    case "signal": {
      const s = node.signal;
      return s.family === "TIME_WINDOW" ? node : { ...node, signal: { ...s, timeframe: undefined } };
    }
  }
}

const idealCount = (n: number) => (n >= 2 && n <= 6 ? 0 : -Math.min(Math.abs(n - 4), 30));

/** A chart where this rule turns on a handful of times, with the moments it does. */
function fireOn(condition: ConditionNode): { candles: Candle[]; edges: number[]; truth: boolean[] } {
  const rule = singleChart(condition);
  const found = bestSeed((c) => idealCount(risingEdges(conditionTruthPerBar(c, rule)).length), 0);
  const truth = conditionTruthPerBar(found.candles, rule);
  return { candles: found.candles, edges: risingEdges(truth), truth };
}

export function blockDemo(name: string, condition: ConditionNode): DemoData {
  const { candles, edges } = fireOn(condition);
  const rule = (() => {
    try {
      return conditionToText(condition);
    } catch {
      return name;
    }
  })();
  return {
    kind: "block",
    title: name,
    candles,
    markers: [],
    notes: edges.map((i) => ({ time: candles[i].time, text: "Present", color: COLORS[0] })),
    overlays: [],
    lower: [],
    hits: edges.length,
    lines: [
      edges.length
        ? `On this made-up stock (₹${DEMO_BASE.toLocaleString("en-IN")} to start) the block is present ${edges.length} time${edges.length === 1 ? "" : "s"} — each is marked on the chart.`
        : `On this made-up stock the block never turned on, so there is nothing to mark. That can simply mean it is a rare component.`,
      `It is present when: ${rule}.`,
      "A block only answers “is this here on this candle?” — what to do about it is decided later, in a concept and a trading system.",
    ],
  };
}

export function indicatorDemo(name: string, def: CustomIndicatorDef): DemoData {
  const candles = sampleCandles(4);
  const visual = customVisual(candles, def, name);
  const lines: DemoLine[] = visual.lines.map((l, i) => ({ label: l.label, color: COLORS[i % COLORS.length], dashed: l.dashed, points: l.points }));
  const onPrice = visual.pane === "price";
  const markers = visual.markers;
  const text = (() => {
    try {
      return describeCustom(def);
    } catch {
      return name;
    }
  })();
  return {
    kind: "indicator",
    title: name,
    candles,
    markers: [],
    notes: markers.map((time) => ({ time, text: "Signal", color: COLORS[0] })),
    overlays: onPrice ? lines : [],
    lower: onPrice ? [] : lines,
    hits: markers.length,
    lines: [
      `Drawn on a made-up stock that starts at ₹${DEMO_BASE.toLocaleString("en-IN")} — ${onPrice ? "the line sits on the candles" : "the line has its own scale under the chart"}.`,
      `${classifyCustom(def)}: ${text}`,
      markers.length ? `${markers.length} signal${markers.length === 1 ? "" : "s"} marked where it turns on.` : "Read it by how the line moves against the price: rules can compare it to a level or to another line.",
    ],
  };
}

export type DemoBlockPart = { name: string; condition: ConditionNode };

/** A concept: the setup rule (its blocks combined) drawn as markers, with each block's own appearances as small labels so the order is visible. */
export function conceptDemo(name: string, setup: ConditionNode, parts: DemoBlockPart[]): DemoData {
  const { candles, edges } = fireOn(setup);
  const notes: DemoNote[] = [];
  // Each block's appearances, but only the ones that lead into a valid setup (the 12 candles before it) — otherwise the chart is a wall of labels.
  // With no valid setup on this chart, show the first few of each so the user can still see the pieces.
  parts.slice(0, 6).forEach((p, k) => {
    const rule = singleChart(p.condition);
    try {
      const own = risingEdges(conditionTruthPerBar(candles, rule));
      const leading = own.filter((i) => edges.some((e) => i <= e && e - i <= 12));
      for (const i of (edges.length ? leading : own.slice(0, 3)).slice(0, 8)) notes.push({ time: candles[i].time, text: p.name, color: COLORS[(k + 1) % COLORS.length] });
    } catch {
      /* a block that can't be drawn here is simply left off */
    }
  });
  for (const i of edges) notes.push({ time: candles[i].time, text: "Setup valid", color: "#047857" });
  return {
    kind: "concept",
    title: name,
    candles,
    markers: [],
    notes: notes.sort((a, b) => a.time - b.time),
    overlays: [],
    lower: [],
    hits: edges.length,
    lines: [
      edges.length
        ? `On this made-up stock (₹${DEMO_BASE.toLocaleString("en-IN")} to start) the whole setup becomes valid ${edges.length} time${edges.length === 1 ? "" : "s"}. The small labels show each block appearing before it.`
        : "On this made-up stock the blocks never lined up the way this concept needs, so the setup was never valid. Rare setups can do that — the labels show where each block appeared on its own.",
      "The green markers are the moments the concept says “this setup is valid”. Whether to trade it, and how, is decided by the trading system.",
    ],
  };
}
