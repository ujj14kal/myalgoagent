import type { Candle } from "@/lib/market-data";
import { computeCustomSeries, customParts, defFormulas, PART_LABEL, type CustomIndicatorDef, type CustomPart } from "./index";
import { parseProgram, type Node } from "./formula";

// Historical integrity for custom indicators: does a value that was shown for a past candle ever change once newer candles
// arrive? That is what "repainting" and "look-ahead" both look like from the outside, so it is tested directly: the indicator
// is worked out on the full history, then again on the history cut short at several points, and every value on the shortened
// version must equal the same bar's value on the full one.

export type Change = { part: CustomPart; label: string; barIndex: number; time: number; before: number | null; after: number | null };
export type IntegrityReport = {
  /** True when no past value changed at any cut. */
  stable: boolean;
  bars: number;
  cuts: number;
  /** The first few values that changed (shortened history → full history). */
  changes: Change[];
  verdict: string;
  /** How each part of the formula behaves in time (pivots confirmed late, bigger candles closed only…), from its text. */
  timing: string[];
};

const same = (a: number, b: number) => (Number.isNaN(a) && Number.isNaN(b)) || Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

/** `compute` is how a part's values are worked out; it is a parameter only so the detector itself can be tested against a deliberately repainting calculation. */
export function checkIntegrity(candles: Candle[], def: CustomIndicatorDef, maxChanges = 5, compute: typeof computeCustomSeries = computeCustomSeries): IntegrityReport {
  const parts = customParts(def);
  const full = new Map(parts.map((p) => [p, compute(candles, def, p)] as const));
  const n = candles.length;
  const cuts: number[] = [];
  if (n >= 40) for (let k = 1; k <= 8; k++) cuts.push(Math.floor(n * (0.3 + 0.08 * k)));
  const changes: Change[] = [];
  for (const cut of [...new Set(cuts)].filter((c) => c > 20 && c < n)) {
    for (const part of parts) {
      const partial = compute(candles.slice(0, cut), def, part);
      const whole = full.get(part)!;
      for (let i = 0; i < cut; i++) {
        if (!same(partial[i], whole[i]) && changes.length < maxChanges && !changes.some((c) => c.part === part && c.barIndex === i)) {
          changes.push({ part, label: PART_LABEL[part] ?? part, barIndex: i, time: candles[i].time, before: Number.isFinite(partial[i]) ? partial[i] : null, after: Number.isFinite(whole[i]) ? whole[i] : null });
        }
      }
    }
  }
  const stable = changes.length === 0;
  return {
    stable,
    bars: n,
    cuts: cuts.length,
    changes,
    verdict:
      n < 40
        ? "Not enough candles to test — pick an instrument with more history."
        : stable
          ? `No repainting found: ${cuts.length} different cut-offs gave the same past values on all ${n} candles.`
          : "This indicator repaints: values on past candles changed once newer candles arrived. A backtest would see values a live run never had. Look for a calculation that uses a later candle (for example a pivot or a bigger candle that hadn't closed yet).",
    timing: timingNotes(def),
  };
}

// ---------- what a formula does with time, in words ----------

function walk(n: Node, f: (c: Extract<Node, { t: "call" }>) => void): void {
  if (n.t === "neg") return walk(n.a, f);
  if (n.t === "bin") return (walk(n.a, f), walk(n.b, f));
  if (n.t === "call") {
    f(n);
    n.args.forEach((a) => walk(a, f));
  }
}

const formulasOf = defFormulas;

export function timingNotes(def: CustomIndicatorDef): string[] {
  const notes = new Set<string>();
  if (def.type === "line" || def.type === "level" || def.type === "zone") notes.add("A drawing only exists from the moment it was drawn, so a backtest never reads it earlier.");
  for (const src of formulasOf(def)) {
    let tree: Node;
    try {
      tree = parseProgram(src).tree;
    } catch {
      continue;
    }
    walk(tree, (c) => {
      const k = c.args[0] && c.args[0].t === "num" ? c.args[0].v : null;
      if (c.fn === "pivothigh" || c.fn === "pivotlow") notes.add(`${c.fn}(${k}) shows a swing only ${k} candles after it formed, so it is confirmed, not guessed.`);
      if (c.fn === "swinghigh" || c.fn === "swinglow") notes.add(`${c.fn}(${k}) holds the latest swing that is already confirmed (${k} candles late).`);
      if (c.fn === "htf") notes.add(`htf(${k}, …) reads the last fully closed ${k}-minute candle: it never uses a bigger candle that is still forming.`);
    });
  }
  return [...notes];
}

// ---------- cost ----------

export type CostReport = { level: "light" | "moderate" | "heavy"; summary: string; steps: number; longestWindow: number };

/** A rough, honest size of the work a formula asks for, before it is run on a long history. */
export function estimateCost(def: CustomIndicatorDef): CostReport {
  let nodes = 0;
  let window = 1;
  let heavy = 0;
  for (const src of formulasOf(def)) {
    try {
      const prog = parseProgram(src);
      const seen = new Set<Node>();
      const visit = (n: Node) => {
        if (seen.has(n)) return;
        seen.add(n);
        nodes++;
        if (n.t === "neg") visit(n.a);
        else if (n.t === "bin") {
          visit(n.a);
          visit(n.b);
        }
        else if (n.t === "call") {
          n.args.forEach(visit);
          const w = n.args.map((a) => (a.t === "num" ? a.v : 0)).filter((v) => v > 1);
          if (w.length) window = Math.max(window, ...w);
          if (["pivothigh", "pivotlow", "swinghigh", "swinglow", "htf", "median", "percentile", "percentrank", "skew", "correlation", "covariance"].includes(n.fn)) heavy++;
        }
      };
      visit(prog.tree);
    } catch {
      /* an unparsable formula is reported elsewhere */
    }
  }
  const score = nodes * Math.max(1, Math.log2(window + 1)) + heavy * 20;
  const level = score < 60 ? "light" : score < 220 ? "moderate" : "heavy";
  return { level, steps: nodes, longestWindow: window, summary: `${level[0].toUpperCase()}${level.slice(1)}: ${nodes} calculation${nodes === 1 ? "" : "s"}, longest window ${window} candles${heavy ? `, ${heavy} that look back over many candles` : ""}.` };
}
