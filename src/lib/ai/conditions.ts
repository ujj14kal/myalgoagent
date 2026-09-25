import { parseDsl } from "@/lib/strategy/dsl";
import { INDICATOR_CATALOG, OSCILLATOR_KINDS, OSCILLATOR_SCALE_GROUP } from "@/lib/strategy/indicator-catalog";
import { CANDLE_PATTERN_CATALOG } from "@/lib/strategy/candle-pattern-catalog";
import { CHART_PATTERN_CATALOG } from "@/lib/strategy/chart-pattern-catalog";
import { VOLUME_PATTERN_CATALOG } from "@/lib/strategy/volume-pattern-catalog";
import type { BooleanSignalKind, ComparisonOperator, ConditionNode, Operand, PriceField } from "@/lib/strategy/types";
import type { CandleInterval } from "@/lib/market-data";

// The agent describes conditions in a compact JSON form (or the strategy
// language for plain comparisons); this turns it into exactly the condition
// tree the visual builder saves — so the agent can build everything a person
// can: indicators, price, time windows, candle/chart/volume patterns, other
// timeframes and other instruments, with AND / OR / NOT.

export const TIMEFRAMES: CandleInterval[] = ["1m", "2m", "5m", "15m", "30m", "60m", "1d", "1wk", "1mo"];

const OPS: Record<string, ComparisonOperator> = {
  ">": "GT",
  "<": "LT",
  ">=": "GTE",
  "<=": "LTE",
  "==": "EQ",
  crosses_above: "CROSSES_ABOVE",
  crossesabove: "CROSSES_ABOVE",
  crosses_below: "CROSSES_BELOW",
  crossesbelow: "CROSSES_BELOW",
};

const PRICE: Record<string, PriceField> = { open: "OPEN", high: "HIGH", low: "LOW", close: "CLOSE", volume: "VOLUME" };
const INDICATORS = new Map(INDICATOR_CATALOG.map((d) => [d.dslName, d]));
const CANDLES = new Set(CANDLE_PATTERN_CATALOG.map((p) => p.kind as string));
const CHARTS = new Set(CHART_PATTERN_CATALOG.map((p) => p.kind as string));
const VOLUMES = new Set(VOLUME_PATTERN_CATALOG.map((p) => p.kind as string));

type J = Record<string, unknown>;
const isObj = (v: unknown): v is J => !!v && typeof v === "object" && !Array.isArray(v);

function timeframeOf(v: unknown, where: string): CandleInterval | undefined {
  if (v == null || v === "") return undefined;
  const tf = String(v).toLowerCase().replace(/^1h$/, "60m");
  if (!TIMEFRAMES.includes(tf as CandleInterval)) throw new Error(`${where}: timeframe "${v}" isn't supported — use one of ${TIMEFRAMES.join(", ")}.`);
  return tf as CandleInterval;
}

function symbolOf(v: unknown): string | undefined {
  if (v == null || v === "") return undefined;
  const s = String(v).trim().toUpperCase();
  return s.endsWith(".NS") ? s : `${s}.NS`;
}

function toOperand(v: unknown, where: string): Operand {
  if (typeof v === "number" && Number.isFinite(v)) return { kind: "constant", value: v };
  // Forgiving shapes models often write: {"value": 30}, {"constant": 30}, or the builder's own operand.
  if (isObj(v) && typeof v.kind === "string" && ["constant", "price", "indicator"].includes(v.kind)) return v as unknown as Operand;
  if (isObj(v) && ("value" in v || "constant" in v) && !("indicator" in v) && !("price" in v)) return toOperand(v.value ?? v.constant, where);
  if (typeof v === "string") {
    const t = v.trim().toLowerCase();
    if (PRICE[t]) return { kind: "price", field: PRICE[t] };
    if (/^-?\d+(\.\d+)?$/.test(t)) return { kind: "constant", value: Number(t) };
    // An indicator written the strategy-language way, e.g. "rsi(14)".
    const m = /^([a-z]+)\(([^)]*)\)$/.exec(t);
    if (m) return toOperand({ indicator: m[1], params: m[2] ? m[2].split(",").map((x) => Number(x.trim())) : [] }, where);
    throw new Error(`${where}: "${v}" isn't a value — use a number, a price field (close, open, high, low, volume) or an indicator like rsi(14).`);
  }
  if (isObj(v)) {
    const timeframe = timeframeOf(v.timeframe, where);
    const instrumentSymbol = symbolOf(v.symbol ?? v.instrument);
    if (typeof v.price === "string") {
      const field = PRICE[v.price.toLowerCase()];
      if (!field) throw new Error(`${where}: price must be open, high, low, close or volume.`);
      return { kind: "price", field, ...(timeframe ? { timeframe } : {}), ...(instrumentSymbol ? { instrumentSymbol } : {}) };
    }
    if (typeof v.indicator === "string") {
      const def = INDICATORS.get(v.indicator.toLowerCase().replace(/[\s_-]/g, ""));
      if (!def) throw new Error(`${where}: unknown indicator "${v.indicator}". Available: ${[...INDICATORS.keys()].join(", ")}.`);
      const raw = Array.isArray(v.params) ? v.params.map(Number) : [];
      const params = def.paramLabels.map((_, i) => (Number.isFinite(raw[i]) ? raw[i] : def.defaults[i]));
      return { kind: "indicator", type: def.kind, params, ...(timeframe ? { timeframe } : {}), ...(instrumentSymbol ? { instrumentSymbol } : {}) };
    }
  }
  throw new Error(`${where}: couldn't read this value: ${JSON.stringify(v)}.`);
}

function clockToMinutes(v: unknown, where: string): number {
  const m = /^(\d{1,2}):(\d{2})\s*(am|pm)?$/i.exec(String(v).trim());
  if (!m) throw new Error(`${where}: time "${v}" should look like 09:15.`);
  let h = Number(m[1]);
  const min = Number(m[2]);
  if (m[3]) {
    const pm = m[3].toLowerCase() === "pm";
    if (h === 12) h = pm ? 12 : 0;
    else if (pm) h += 12;
  }
  if (h > 23 || min > 59) throw new Error(`${where}: "${v}" isn't a valid time.`);
  return h * 60 + min;
}

function pattern(set: Set<string>, v: unknown, kind: string, where: string): string {
  const k = String(v).trim().toUpperCase().replace(/[\s-]+/g, "_").replace(/&/g, "AND");
  if (!set.has(k)) throw new Error(`${where}: unknown ${kind} pattern "${v}". Available: ${[...set].join(", ")}.`);
  return k;
}

export function toConditionNode(v: unknown, where = "condition"): ConditionNode {
  // Strategy-language text, e.g. "rsi(14) < 30 and close > sma(200)".
  if (typeof v === "string") {
    try {
      return parseDsl(v);
    } catch (err) {
      throw new Error(`${where}: ${err instanceof Error ? err.message : "couldn't read the rule"} (in "${v}").`);
    }
  }
  if (!isObj(v)) throw new Error(`${where}: expected a condition object.`);

  // Already a builder node (e.g. copied from a saved strategy) — the validator checks it later.
  if (typeof v.kind === "string" && ["group", "not", "comparison", "signal"].includes(v.kind)) return v as unknown as ConditionNode;
  // Wrapped forms: {"comparison": {...}}, {"condition": {...}}, {"signal": {...}}.
  for (const key of ["comparison", "condition", "signal"]) {
    if (key in v && isObj(v[key]) && Object.keys(v).length === 1) return toConditionNode(v[key], where);
  }
  if ("and" in v && !("all" in v)) return toConditionNode({ all: v.and }, where);
  if ("or" in v && !("any" in v)) return toConditionNode({ any: v.or }, where);

  const list = (key: "all" | "any") => {
    const arr = v[key];
    if (!Array.isArray(arr) || arr.length === 0) throw new Error(`${where}: "${key}" needs a non-empty list of conditions.`);
    return arr.map((c, i) => toConditionNode(c, `${where}.${key}[${i}]`));
  };
  if ("all" in v) return { kind: "group", op: "AND", children: list("all") };
  if ("any" in v) return { kind: "group", op: "OR", children: list("any") };
  if ("not" in v) return { kind: "not", child: toConditionNode(v.not, `${where}.not`) };

  if ("time_between" in v) {
    const pair = v.time_between;
    if (!Array.isArray(pair) || pair.length !== 2) throw new Error(`${where}: time_between needs ["HH:MM", "HH:MM"].`);
    const signal: BooleanSignalKind = { family: "TIME_WINDOW", startMinute: clockToMinutes(pair[0], where), endMinute: clockToMinutes(pair[1], where) };
    if (signal.endMinute <= signal.startMinute) throw new Error(`${where}: the window's end must be after its start.`);
    return { kind: "signal", signal };
  }
  const tf = timeframeOf(v.timeframe, where);
  if ("candle_pattern" in v) {
    return { kind: "signal", signal: { family: "CANDLE_PATTERN", pattern: pattern(CANDLES, v.candle_pattern, "candle", where) as never, ...(tf ? { timeframe: tf } : {}) } };
  }
  if ("chart_pattern" in v) {
    return { kind: "signal", signal: { family: "CHART_PATTERN", pattern: pattern(CHARTS, v.chart_pattern, "chart", where) as never, ...(tf ? { timeframe: tf } : {}) } };
  }
  if ("volume_pattern" in v) {
    return { kind: "signal", signal: { family: "VOLUME_PATTERN", pattern: pattern(VOLUMES, v.volume_pattern, "volume", where) as never, ...(tf ? { timeframe: tf } : {}) } };
  }

  if ("left" in v && "right" in v) {
    const op = OPS[String(v.op ?? v.operator ?? "").toLowerCase().replace(/\s+/g, "_")];
    if (!op) throw new Error(`${where}: "op" must be one of >, <, >=, <=, ==, crosses_above, crosses_below.`);
    return { kind: "comparison", left: toOperand(v.left, `${where}.left`), operator: op, right: toOperand(v.right, `${where}.right`) };
  }
  throw new Error(`${where}: unrecognised condition ${JSON.stringify(v).slice(0, 120)}.`);
}

const oscillators = INDICATOR_CATALOG.filter((d) => OSCILLATOR_KINDS.has(d.kind)).map((d) => d.dslName);
const pairs = Object.entries(
  Object.entries(OSCILLATOR_SCALE_GROUP).reduce<Record<string, string[]>>((acc, [kind, group]) => {
    const name = INDICATOR_CATALOG.find((d) => d.kind === kind)?.dslName;
    if (name && group) (acc[group] ??= []).push(name);
    return acc;
  }, {})
).map(([, names]) => names.join(" / "));

/** The full reference the agent gets — generated from the platform's own catalogues so it can't drift. */
export const CONDITION_REFERENCE = [
  "CONDITIONS (entry / exit) — either a strategy-language string for simple comparisons, e.g. \"rsi(14) < 30 and close > sma(200)\", or JSON:",
  '- groups: {"all":[...]} (AND), {"any":[...]} (OR), {"not": condition}',
  '- comparison: {"left": value, "op": ">"|"<"|">="|"<="|"=="|"crosses_above"|"crosses_below", "right": value}',
  '- value: a number; "close"/"open"/"high"/"low"/"volume"; {"indicator":"rsi","params":[14]}; {"price":"close"}. Any indicator or price value can add "timeframe" (' +
    TIMEFRAMES.join(", ") +
    ') to read another chart, and/or "symbol" (e.g. "TCS.NS") to read another instrument.',
  '- time of day (IST): {"time_between":["09:15","09:30"]} — true while the bar time is inside the window (end exclusive). "Enter at 9:15" = time_between 09:15–09:16 or a short window; "exit at/after 3:15 pm" = time_between 15:15–15:30.',
  `- candle pattern: {"candle_pattern":"HAMMER"} — ${CANDLE_PATTERN_CATALOG.map((p) => p.kind).join(", ")}`,
  `- chart pattern: {"chart_pattern":"DOUBLE_BOTTOM"} — ${CHART_PATTERN_CATALOG.map((p) => p.kind).join(", ")}`,
  `- volume pattern: {"volume_pattern":"VOLUME_SPIKE"} — ${VOLUME_PATTERN_CATALOG.map((p) => p.kind).join(", ")}`,
  '  Patterns can add "timeframe" to detect on another chart. Patterns and time windows are true/false conditions — never compare them to a value.',
  "- indicators and their settings: " + INDICATOR_CATALOG.map((d) => `${d.dslName}(${d.paramLabels.join(", ") || "no settings"})`).join(", "),
  "RULES THE VALIDATOR ENFORCES (follow them; if it still rejects, fix and retry):",
  `- These have their own scale, unrelated to price: ${oscillators.join(", ")}. Compare them only to a fixed number (rsi(14) > 70, rsi crosses_above 30) or to their own partner: ${pairs.join("; ")}. Never compare them to price or a moving average.`,
  "- Don't compare a value with itself, or two plain numbers with each other.",
  "- Avoid == between two moving values (they almost never match exactly) — use crosses_above / crosses_below.",
  "- Within an AND, don't combine conditions that can't both be true (e.g. rsi(14) > 70 and rsi(14) < 30), and don't AND two patterns or two time windows of the same kind — use OR.",
  "- Time windows must fall inside NSE hours, 09:15–15:30 IST.",
  "- A strategy may have no rule-based exit only if it has a stop-loss, take-profit or trailing stop (set exit to null).",
].join("\n");
