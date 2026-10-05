import type { ConditionNode, Operand, BooleanSignalKind, ComparisonOperator } from "./types";
import { INDICATOR_CATALOG } from "./indicator-catalog";
import { PART_LABEL } from "@/lib/custom-indicator";

// Readable text for a saved condition tree, in the same notation as the
// strategy language (so a code-mode user recognises it). Used to explain
// trades: "your entry rule (rsi(14) < 30) was true at the close on 22 Sep".

const DSL_BY_KIND = new Map(INDICATOR_CATALOG.map((d) => [d.kind, d.dslName]));

const OPERATORS: Record<ComparisonOperator, string> = {
  GT: ">",
  LT: "<",
  GTE: ">=",
  LTE: "<=",
  EQ: "==",
  CROSSES_ABOVE: "crossesAbove",
  CROSSES_BELOW: "crossesBelow",
};

const humanize = (s: string) => s.toLowerCase().replace(/_/g, " ").replace(/\bobv\b/g, "OBV");

function suffix(o: { timeframe?: string; instrumentSymbol?: string }): string {
  const parts = [o.instrumentSymbol, o.timeframe].filter(Boolean);
  return parts.length ? ` [${parts.join(", ")}]` : "";
}

export function operandToText(o: Operand): string {
  switch (o.kind) {
    case "constant":
      return String(o.value);
    case "price":
      return `${o.field.toLowerCase()}${suffix(o)}`;
    case "indicator":
      return `${DSL_BY_KIND.get(o.type) ?? humanize(o.type)}(${o.params.join(",")})${suffix(o)}`;
    case "custom":
      return `“${o.name}”${o.part && o.part !== "value" ? ` ${PART_LABEL[o.part]}` : ""}${suffix(o)}`;
  }
}

const clock = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;

function signalToText(s: BooleanSignalKind): string {
  switch (s.family) {
    case "TIME_WINDOW":
      return `time between ${clock(s.startMinute)} and ${clock(s.endMinute)}`;
    case "CANDLE_PATTERN":
      return `${humanize(s.pattern)} candle${s.atLevel ? ` at ${s.atLevel === "SUPPORT" ? "support" : "resistance"}` : ""}${
        s.window ? ` between ${clock(s.window.startMinute)} and ${clock(s.window.endMinute)}` : ""
      }${suffix(s)}`;
    case "CHART_PATTERN":
      return `${humanize(s.pattern)} pattern${suffix(s)}`;
    case "VOLUME_PATTERN":
      // "volume spike", not "volume spike volume".
      return `${humanize(s.pattern)}${/volume/i.test(s.pattern) ? "" : " (volume)"}${suffix(s)}`;
  }
}

export function conditionToText(node: ConditionNode, nested = false): string {
  switch (node.kind) {
    case "comparison":
      return `${operandToText(node.left)} ${OPERATORS[node.operator]} ${operandToText(node.right)}`;
    case "signal":
      return signalToText(node.signal);
    case "not":
      return `not (${conditionToText(node.child, false)})`;
    case "recent": {
      const n = node.bars;
      const span = node.excludeCurrent ? `in the ${n === 1 ? "previous candle" : `${n} candles before this one`}` : n === 1 ? "on this candle" : `within the last ${n} candles`;
      return node.mode === "ALL" ? `(${conditionToText(node.child, false)}) held on each of the last ${n} candle${n === 1 ? "" : "s"}${node.excludeCurrent ? " before this one" : ""}` : `(${conditionToText(node.child, false)}) was true ${span}`;
    }
    case "group": {
      if (node.children.length === 1) return conditionToText(node.children[0], nested);
      const joined = node.children.map((c) => conditionToText(c, true)).join(` ${node.op.toLowerCase()} `);
      return nested ? `(${joined})` : joined;
    }
  }
}
