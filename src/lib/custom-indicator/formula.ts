import type { Candle } from "@/lib/market-data";
import { computeIndicatorSeries } from "@/lib/strategy/compute-series";
import { INDICATOR_CATALOG } from "@/lib/strategy/indicator-catalog";
import type { IndicatorKind } from "@/lib/strategy/types";

// A user's own indicator, written as a formula over prices and indicators —
// e.g. "(ema(close, 20) - ema(close, 50)) / atr(14)". A small, safe language:
// numbers, price series, + - * / ^, comparisons (true = 1, false = 0),
// and a fixed list of functions. Nothing is ever executed as code; the formula
// is parsed into a tree and evaluated bar by bar, so it stays readable and
// the same on the chart, in backtests and in forward tests.

export type Node =
  | { t: "num"; v: number }
  | { t: "series"; name: SeriesName }
  | { t: "neg"; a: Node }
  | { t: "bin"; op: "+" | "-" | "*" | "/" | "^" | ">" | "<" | ">=" | "<=" | "==" | "!=" | "and" | "or"; a: Node; b: Node }
  | { t: "call"; fn: string; args: Node[]; /** For ind(name): the other custom indicator being read. */ ref?: string };

const SERIES = ["open", "high", "low", "close", "volume", "hl2", "hlc3", "ohlc4", "range", "body", "upwick", "lowwick", "tr", "barindex"] as const;
type SeriesName = (typeof SERIES)[number];

/** Functions over any series: fn(source, length). */
const WINDOW_FNS = ["sma", "ema", "wma", "rma", "rsi", "stdev", "highest", "lowest", "sum", "change", "ref", "roc"] as const;
const MATH_FNS = ["abs", "sqrt", "log", "min", "max", "if", "crossover", "crossunder"] as const;
/** One value in, one out. */
const MATH1_FNS = ["exp", "sin", "cos", "tan", "floor", "ceil", "round", "sign", "isna"] as const;
/** fn(source, length): rolling statistics and fits. */
const STAT_FNS = ["median", "variance", "zscore", "percentrank", "linreg", "slope", "normalize", "skew"] as const;
/** Whole-history counters and memories (each bar sees only what came before it). */
const STATE_FNS = ["barssince", "streak", "cum", "valuewhen", "rising", "falling"] as const;
/** Pivots confirmed `length` bars after they form, so a value never changes once shown. */
const PIVOT_FNS = ["pivothigh", "pivotlow", "swinghigh", "swinglow"] as const;
/** Price-action structure, each confirmed on the candle that completes it. */
const STRUCTURE_FNS = ["fvgbull", "fvgbear", "fvgbullmid", "fvgbearmid", "eqhigh", "eqlow", "sweephigh", "sweeplow", "bosup", "bosdown", "obbullhigh", "obbulllow", "obbearhigh", "obbearlow"] as const;
/** Clock of the candle, in IST. */
const TIME_FNS = ["hour", "minute", "minuteofday", "dayofweek"] as const;
const HTF_TIMEFRAMES = [5, 10, 15, 30, 60, 120, 240, 1440] as const;
export const FORMULA_FUNCTION_NOTES: Record<string, string> = {
  exp: "e raised to the value", sin: "sine", cos: "cosine", tan: "tangent", floor: "round down", ceil: "round up", round: "round to the nearest whole", sign: "−1, 0 or 1", isna: "1 where the value isn't available yet",
  nz: "nz(x) or nz(x, r): x, or r (default 0) where x isn't available", pow: "pow(a, b): a to the power b", mod: "mod(a, b): remainder", clamp: "clamp(x, lo, hi): x kept between lo and hi",
  median: "median(source, n): the middle value of the last n", variance: "variance(source, n): spread squared", zscore: "zscore(source, n): how many standard deviations from the n-bar mean", percentrank: "percentrank(source, n): 0–100, the share of the last n values at or below this one",
  linreg: "linreg(source, n): the regression line's value now", slope: "slope(source, n): the regression line's slope per bar", normalize: "normalize(source, n): 0–1 position between the n-bar low and high", skew: "skew(source, n): lopsidedness of the last n values",
  percentile: "percentile(source, n, p): the p-th percentile (0–100) of the last n", correlation: "correlation(a, b, n): −1 to 1 over the last n", covariance: "covariance(a, b, n)",
  barssince: "barssince(cond): bars since the condition was last true", streak: "streak(cond): how many bars in a row it has been true", cum: "cum(source): running total", valuewhen: "valuewhen(cond, source, k): the source's value when the condition was true, k occurrences ago (default 0 = latest)",
  rising: "rising(source, n): 1 when the source rose on each of the last n bars", falling: "falling(source, n): 1 when it fell on each of the last n bars",
  pivothigh: "pivothigh(n): a swing high that was the highest of n bars either side, shown n bars after it formed", pivotlow: "pivotlow(n): same for a swing low", swinghigh: "swinghigh(n): the latest confirmed swing high, held until the next one", swinglow: "swinglow(n): the latest confirmed swing low",
  hour: "hour(): hour of day, IST", minute: "minute(): minute of the hour", minuteofday: "minuteofday(): minutes since midnight, IST (09:15 = 555)", dayofweek: "dayofweek(): 1 = Monday … 7 = Sunday",
  fvgbull: "fvgbull(): 1 on the candle that completes a bullish fair value gap (this candle's low is above the high two candles back)", fvgbear: "fvgbear(): 1 on a bearish fair value gap (this candle's high is below the low two candles back)",
  fvgbullmid: "fvgbullmid(): the middle of the latest bullish gap that price has not yet closed below; empty once it is filled", fvgbearmid: "fvgbearmid(): the middle of the latest bearish gap not yet closed above",
  eqhigh: "eqhigh(n, tolerance%): 1 when this high is within the tolerance of the highest of the previous n highs (equal highs)", eqlow: "eqlow(n, tolerance%): equal lows",
  sweephigh: "sweephigh(n): 1 when price pokes above the previous n highs but closes back below them (a liquidity sweep up)", sweeplow: "sweeplow(n): a sweep below the previous n lows that closes back above",
  bosup: "bosup(n): 1 on the candle that closes above the latest confirmed n-bar swing high (break of structure up)", bosdown: "bosdown(n): closes below the latest confirmed swing low",
  obbullhigh: "obbullhigh(n): top of the last down candle before a break of structure up, held until price closes below its bottom", obbulllow: "obbulllow(n): bottom of that bullish order block",
  obbearhigh: "obbearhigh(n): top of the last up candle before a break of structure down, held until price closes above its top", obbearlow: "obbearlow(n): bottom of that bearish order block",
  ind: "ind(name): the values of another custom indicator of yours (spaces in its name written as _), so indicators can be built from indicators",
  htf: `htf(minutes, formula): the formula worked out on bigger candles (${HTF_TIMEFRAMES.join(", ")} minutes), using only candles that have fully closed`,
};
/** Built-in indicators callable by name with numeric settings, e.g. atr(14), supertrend(10, 3). */
const CATALOG = new Map(INDICATOR_CATALOG.map((d) => [d.dslName, d]));

export class FormulaError extends Error {}

const MAX_LENGTH = 4000;
const MAX_NODES = 600;
const MAX_EXPANDED = 20_000;
const MAX_WINDOW = 1000;
const MAX_STATEMENTS = 30;

// ---------- parsing ----------

type Tok = { k: "num"; v: number } | { k: "id"; v: string } | { k: "op"; v: string } | { k: "(" } | { k: ")" } | { k: "," };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
    } else if (/[0-9.]/.test(c)) {
      const m = /^\d*\.?\d+(?:e[+-]?\d+)?/i.exec(src.slice(i));
      if (!m) throw new FormulaError(`Unexpected "${c}" at position ${i + 1}.`);
      out.push({ k: "num", v: Number(m[0]) });
      i += m[0].length;
    } else if (/[a-z_]/i.test(c)) {
      const m = /^[a-z_][a-z0-9_]*/i.exec(src.slice(i))!;
      out.push({ k: "id", v: m[0].toLowerCase() });
      i += m[0].length;
    } else if (c === "(" || c === ")" || c === ",") {
      out.push({ k: c });
      i++;
    } else {
      const two = src.slice(i, i + 2);
      if ([">=", "<=", "==", "!=", "&&", "||"].includes(two)) {
        out.push({ k: "op", v: two === "&&" ? "and" : two === "||" ? "or" : two });
        i += 2;
      } else if ("+-*/^<>".includes(c)) {
        out.push({ k: "op", v: c });
        i++;
      } else throw new FormulaError(`"${c}" isn't allowed in a formula (position ${i + 1}).`);
    }
  }
  return out;
}

const RESERVED = new Set<string>([...SERIES, ...WINDOW_FNS, ...MATH_FNS, ...MATH1_FNS, ...STAT_FNS, ...STATE_FNS, ...PIVOT_FNS, ...STRUCTURE_FNS, ...TIME_FNS, "htf", "ind", "nz", "pow", "mod", "clamp", "percentile", "correlation", "covariance", "and", "or"]);

/** How many nodes a tree has once every name is replaced by what it stands for (shared parts counted each time they're used). */
const sizes = new WeakMap<object, number>();
function expanded(n: Node): number {
  const hit = sizes.get(n);
  if (hit !== undefined) return hit;
  const v = n.t === "neg" ? 1 + expanded(n.a) : n.t === "bin" ? 1 + expanded(n.a) + expanded(n.b) : n.t === "call" ? 1 + n.args.reduce((x, c) => x + expanded(c), 0) : 1;
  sizes.set(n, v);
  return v;
}

export type FormulaProgram = { tree: Node; /** Every name set with `name = …`, in order, so each step can be inspected. */ steps: { name: string; tree: Node }[] };

/**
 * Parses a formula, or several steps: lines (or `;`) like `momentum = close - ema(close, 50)` that later lines can use,
 * ending with the line that is the indicator itself. Throws FormulaError with a plain-English reason.
 */
export function parseProgram(src: string, uses?: readonly string[]): FormulaProgram {
  const text = src.trim();
  if (!text) throw new FormulaError("Write a formula, e.g. ema(close, 20) - ema(close, 50).");
  if (text.length > MAX_LENGTH) throw new FormulaError(`Keep formulas under ${MAX_LENGTH} characters.`);
  const statements = text.split(/[\n;]+/).map((x) => x.trim()).filter(Boolean);
  if (statements.length > MAX_STATEMENTS) throw new FormulaError(`Use at most ${MAX_STATEMENTS} steps in one formula.`);
  const scope = new Map<string, Node>();
  const steps: { name: string; tree: Node }[] = [];
  const budget = { n: 0 };
  let tree: Node | null = null;
  statements.forEach((st, i) => {
    const m = /^([a-z_][a-z0-9_]*)\s*=(?!=)\s*(.*)$/i.exec(st);
    if (m) {
      const name = m[1].toLowerCase();
      if (RESERVED.has(name)) throw new FormulaError(`“${name}” is already a name in the formula language — pick another name for this step.`);
      if (scope.has(name)) throw new FormulaError(`“${name}” is set twice — give each step its own name.`);
      if (i === statements.length - 1) throw new FormulaError("The last line must be the indicator itself, not a name being set — write the formula that uses your steps.");
      const t = parseExpr(m[2], scope, budget, uses);
      scope.set(name, t);
      steps.push({ name, tree: t });
    } else {
      if (i !== statements.length - 1) throw new FormulaError(`Line ${i + 1} sets nothing: write “name = formula” for the steps, and put the indicator's own formula last.`);
      tree = parseExpr(st, scope, budget, uses);
    }
  });
  if (!tree) throw new FormulaError("Write the indicator's own formula on the last line.");
  if (expanded(tree) > MAX_EXPANDED) throw new FormulaError("That formula expands to too much work — simplify it, or split it into two custom indicators.");
  return { tree, steps };
}

/** Parses and checks a formula (see parseProgram for steps). Throws FormulaError with a plain-English reason. */
export function parseFormula(src: string, uses?: readonly string[]): Node {
  return parseProgram(src, uses).tree;
}

function parseExpr(text: string, scope: Map<string, Node>, budget: { n: number }, uses?: readonly string[]): Node {
  const toks = tokenize(text);
  let p = 0;
  const peek = () => toks[p];
  const node = <T extends Node>(n: T): T => {
    if (++budget.n > MAX_NODES) throw new FormulaError("That formula is too long — split it into two custom indicators.");
    return n;
  };
  const expectClose = () => {
    if (peek()?.k !== ")") throw new FormulaError("A bracket is missing a closing “)”.");
    p++;
  };
  const isOp = (...ops: string[]) => {
    const t = peek();
    return t?.k === "op" && ops.includes(t.v) ? t.v : t?.k === "id" && ops.includes(t.v) ? t.v : null;
  };

  const or = (): Node => {
    let a = and();
    while (isOp("or")) {
      p++;
      a = node({ t: "bin", op: "or", a, b: and() });
    }
    return a;
  };
  const and = (): Node => {
    let a = cmp();
    while (isOp("and")) {
      p++;
      a = node({ t: "bin", op: "and", a, b: cmp() });
    }
    return a;
  };
  const cmp = (): Node => {
    let a = add();
    let op: string | null;
    while ((op = isOp(">", "<", ">=", "<=", "==", "!="))) {
      p++;
      a = node({ t: "bin", op: op as ">", a, b: add() });
    }
    return a;
  };
  const add = (): Node => {
    let a = mul();
    let op: string | null;
    while ((op = isOp("+", "-"))) {
      p++;
      a = node({ t: "bin", op: op as "+", a, b: mul() });
    }
    return a;
  };
  const mul = (): Node => {
    let a = unary();
    let op: string | null;
    while ((op = isOp("*", "/"))) {
      p++;
      a = node({ t: "bin", op: op as "*", a, b: unary() });
    }
    return a;
  };
  const unary = (): Node => {
    if (isOp("-")) {
      p++;
      return node({ t: "neg", a: unary() });
    }
    if (isOp("+")) {
      p++;
      return unary();
    }
    const base = primary();
    if (isOp("^")) {
      p++;
      return node({ t: "bin", op: "^", a: base, b: unary() });
    }
    return base;
  };
  const primary = (): Node => {
    const t = toks[p++];
    if (!t) throw new FormulaError("The formula ends too early.");
    if (t.k === "num") return node({ t: "num", v: t.v });
    if (t.k === "(") {
      const e = or();
      expectClose();
      return e;
    }
    if (t.k === "id") {
      if (t.v === "ind" && peek()?.k === "(") {
        // ind(name): another custom indicator of yours, by its name with spaces written as _
        p++;
        const id = toks[p++];
        if (!id || id.k !== "id") throw new FormulaError("ind() takes the name of one of your custom indicators, with spaces written as _, e.g. ind(trend_score).");
        expectClose();
        if (uses && !uses.includes(id.v)) throw new FormulaError(`There's no custom indicator of yours called “${id.v}”. Use its name with spaces written as _ (for example “Trend score” is trend_score).`);
        return node({ t: "call", fn: "ind", args: [], ref: id.v });
      }
      if (peek()?.k === "(") {
        p++;
        const args: Node[] = [];
        if (peek()?.k !== ")") {
          args.push(or());
          while (peek()?.k === ",") {
            p++;
            args.push(or());
          }
        }
        expectClose();
        return node({ t: "call", fn: t.v, args });
      }
      const own = scope.get(t.v);
      if (own) return own;
      if ((SERIES as readonly string[]).includes(t.v)) return node({ t: "series", name: t.v as SeriesName });
      throw new FormulaError(`Unknown name "${t.v}". Use open, high, low, close, volume, hl2, hlc3, ohlc4, range, body, upwick, lowwick, tr, barindex, a name you set earlier in the formula, or a function like sma(close, 20).`);
    }
    throw new FormulaError("Something's missing between the operators.");
  };

  const tree = or();
  if (p < toks.length) throw new FormulaError("There's extra text after the formula — check brackets and commas.");
  if (expanded(tree) > MAX_EXPANDED) throw new FormulaError("That formula expands to too much work — simplify it, or split it into two custom indicators.");
  check(tree);
  return tree;
}


const isConst = (n: Node): n is { t: "num"; v: number } => n.t === "num" || (n.t === "neg" && n.a.t === "num");
const constOf = (n: Node) => (n.t === "num" ? n.v : n.t === "neg" && n.a.t === "num" ? -n.a.v : NaN);

const checked = new WeakSet<object>();
function check(n: Node): void {
  // A name used many times shares one tree: check it once.
  if (checked.has(n)) return;
  checked.add(n);
  if (n.t === "neg") return check(n.a);
  if (n.t === "bin") return (check(n.a), check(n.b));
  if (n.t !== "call") return;
  n.args.forEach(check);
  const f = n.fn;
  if (f === "ind") return;
  const len = (i: number) => {
    const a = n.args[i];
    if (!a || !isConst(a) || !Number.isInteger(constOf(a)) || constOf(a) < 1 || constOf(a) > MAX_WINDOW) throw new FormulaError(`${f}(): the length must be a whole number from 1 to ${MAX_WINDOW}.`);
  };
  if ((WINDOW_FNS as readonly string[]).includes(f)) {
    // rsi(14), sma(20) etc. with one number = the built-in on the close; otherwise fn(source, length).
    if (n.args.length === 1 && CATALOG.has(f) && isConst(n.args[0])) return len(0);
    if ((f === "change" || f === "ref" || f === "roc") && n.args.length === 1) return;
    if (n.args.length !== 2) throw new FormulaError(`${f}() takes a source and a length, e.g. ${f}(close, 14).`);
    return len(1);
  }
  if ((MATH_FNS as readonly string[]).includes(f)) {
    const want = f === "if" ? 3 : f === "min" || f === "max" || f === "crossover" || f === "crossunder" ? 2 : 1;
    if (n.args.length !== want) throw new FormulaError(`${f}() takes ${want} value${want > 1 ? "s" : ""}.`);
    return;
  }
  const want = (count: number | number[], hint?: string) => {
    const ok = Array.isArray(count) ? count.includes(n.args.length) : n.args.length === count;
    if (!ok) throw new FormulaError(`${f}() ${hint ?? `takes ${Array.isArray(count) ? count.join(" or ") : count} value${count === 1 ? "" : "s"}`}.`);
  };
  const constArg = (i: number, what: string, lo: number, hi: number, whole = true) => {
    const a = n.args[i];
    const v = a && isConst(a) ? constOf(a) : NaN;
    if (!Number.isFinite(v) || v < lo || v > hi || (whole && !Number.isInteger(v))) throw new FormulaError(`${f}(): ${what} must be ${whole ? "a whole number" : "a number"} from ${lo} to ${hi}.`);
  };
  if ((MATH1_FNS as readonly string[]).includes(f)) return want(1);
  if (f === "nz") return want([1, 2], "takes a value and, if you like, what to use instead when it isn't available");
  if (f === "pow" || f === "mod") return want(2);
  if (f === "clamp") return want(3, "takes a value, a lowest and a highest");
  if ((STAT_FNS as readonly string[]).includes(f)) {
    want(2, `takes a source and a length, e.g. ${f}(close, 20)`);
    return constArg(1, "the length", 2, MAX_WINDOW);
  }
  if (f === "percentile") {
    want(3, "takes a source, a length and a percentile (0–100), e.g. percentile(close, 50, 80)");
    constArg(1, "the length", 2, MAX_WINDOW);
    return constArg(2, "the percentile", 0, 100, false);
  }
  if (f === "correlation" || f === "covariance") {
    want(3, `takes two series and a length, e.g. ${f}(close, volume, 20)`);
    return constArg(2, "the length", 2, MAX_WINDOW);
  }
  if (f === "barssince" || f === "streak" || f === "cum") return want(1);
  if (f === "valuewhen") {
    want([2, 3], "takes a condition, a source and, if you like, which earlier time (0 = latest)");
    return n.args.length === 3 ? constArg(2, "the occurrence", 0, 50) : undefined;
  }
  if (f === "rising" || f === "falling") {
    want(2, `takes a source and a number of bars, e.g. ${f}(close, 3)`);
    return constArg(1, "the number of bars", 1, MAX_WINDOW);
  }
  if ((PIVOT_FNS as readonly string[]).includes(f)) {
    want(1, `takes the number of bars each side, e.g. ${f}(5)`);
    return constArg(0, "the number of bars each side", 1, 100);
  }
  if (f === "fvgbull" || f === "fvgbear" || f === "fvgbullmid" || f === "fvgbearmid") return want(0, "takes no values, just write it with empty brackets");
  if (f === "eqhigh" || f === "eqlow") {
    want(2, `takes a number of candles and a tolerance in percent, e.g. ${f}(20, 0.1)`);
    constArg(0, "the number of candles", 2, MAX_WINDOW);
    return constArg(1, "the tolerance", 0, 10, false);
  }
  if (f === "sweephigh" || f === "sweeplow") {
    want(1, `takes the number of earlier candles, e.g. ${f}(20)`);
    return constArg(0, "the number of candles", 2, MAX_WINDOW);
  }
  if (f === "bosup" || f === "bosdown" || f === "obbullhigh" || f === "obbulllow" || f === "obbearhigh" || f === "obbearlow") {
    want(1, `takes the number of bars each side that define a swing, e.g. ${f}(5)`);
    return constArg(0, "the number of bars each side", 1, 100);
  }
  if ((TIME_FNS as readonly string[]).includes(f)) return want(0, "takes no values, just write it with empty brackets");
  if (f === "htf") {
    want(2, `takes a candle size in minutes and a formula, e.g. htf(60, ema(close, 20))`);
    const m = n.args[0] && isConst(n.args[0]) ? constOf(n.args[0]) : NaN;
    if (!(HTF_TIMEFRAMES as readonly number[]).includes(m)) throw new FormulaError(`htf(): the candle size must be one of ${HTF_TIMEFRAMES.join(", ")} minutes.`);
    const hasHtf = (x: Node): boolean => (x.t === "call" ? x.fn === "htf" || x.args.some(hasHtf) : x.t === "neg" ? hasHtf(x.a) : x.t === "bin" ? hasHtf(x.a) || hasHtf(x.b) : false);
    if (hasHtf(n.args[1])) throw new FormulaError("htf() can't be used inside another htf().");
    return;
  }
  const def = CATALOG.get(f);
  if (def) {
    if (n.args.length > def.defaults.length) throw new FormulaError(`${f}() takes up to ${def.defaults.length} setting${def.defaults.length === 1 ? "" : "s"} (${def.paramLabels.join(", ") || "none"}).`);
    if (!n.args.every(isConst)) throw new FormulaError(`${f}()'s settings must be plain numbers.`);
    return;
  }
  throw new FormulaError(`There's no function called ${f}(). See the list of functions.`);
}

// ---------- evaluation ----------

type Arr = number[];
const nan = (n: number) => new Array<number>(n).fill(NaN);

function sma(x: Arr, n: number): Arr {
  const out = nan(x.length);
  let sum = 0;
  let count = 0;
  for (let i = 0; i < x.length; i++) {
    if (Number.isFinite(x[i])) {
      sum += x[i];
      count++;
    }
    if (i >= n && Number.isFinite(x[i - n])) {
      sum -= x[i - n];
      count--;
    }
    if (i >= n - 1 && count === n) out[i] = sum / n;
  }
  return out;
}
function emaLike(x: Arr, alpha: number, n: number): Arr {
  const out = nan(x.length);
  let prev = NaN;
  let seen = 0;
  let seed = 0;
  for (let i = 0; i < x.length; i++) {
    if (!Number.isFinite(x[i])) continue;
    if (seen < n) {
      seed += x[i];
      seen++;
      if (seen === n) out[i] = prev = seed / n;
      continue;
    }
    out[i] = prev = alpha * x[i] + (1 - alpha) * prev;
  }
  return out;
}
function wma(x: Arr, n: number): Arr {
  const out = nan(x.length);
  const denom = (n * (n + 1)) / 2;
  for (let i = n - 1; i < x.length; i++) {
    let s = 0;
    let ok = true;
    for (let k = 0; k < n; k++) {
      const v = x[i - k];
      if (!Number.isFinite(v)) {
        ok = false;
        break;
      }
      s += v * (n - k);
    }
    if (ok) out[i] = s / denom;
  }
  return out;
}
function windowed(x: Arr, n: number, f: (w: number[]) => number): Arr {
  const out = nan(x.length);
  for (let i = n - 1; i < x.length; i++) {
    const w = x.slice(i - n + 1, i + 1);
    if (w.every(Number.isFinite)) out[i] = f(w);
  }
  return out;
}
function rsi(x: Arr, n: number): Arr {
  const up = x.map((v, i) => (i && Number.isFinite(v) && Number.isFinite(x[i - 1]) ? Math.max(v - x[i - 1], 0) : NaN));
  const down = x.map((v, i) => (i && Number.isFinite(v) && Number.isFinite(x[i - 1]) ? Math.max(x[i - 1] - v, 0) : NaN));
  const au = emaLike(up, 1 / n, n);
  const ad = emaLike(down, 1 / n, n);
  return au.map((u, i) => (Number.isFinite(u) && Number.isFinite(ad[i]) ? (ad[i] === 0 ? 100 : 100 - 100 / (1 + u / ad[i])) : NaN));
}
const truthy = (v: number) => Number.isFinite(v) && v !== 0;
function stats(w: number[]) {
  const m = w.reduce((s, v) => s + v, 0) / w.length;
  const variance = w.reduce((s, v) => s + (v - m) ** 2, 0) / w.length;
  return { mean: m, variance, sd: Math.sqrt(variance) };
}
/** Least-squares line through the window (x = 0 … n−1): its slope and its value at the last point. */
function fit(w: number[]) {
  const n = w.length;
  const mx = (n - 1) / 2;
  const my = w.reduce((s, v) => s + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  w.forEach((v, i) => {
    sxy += (i - mx) * (v - my);
    sxx += (i - mx) ** 2;
  });
  const slope = sxx === 0 ? 0 : sxy / sxx;
  return { slope, last: my + slope * (n - 1 - mx) };
}
function windowed2(a: Arr, b: Arr, n: number, f: (x: number[], y: number[]) => number): Arr {
  const out = nan(a.length);
  for (let i = n - 1; i < a.length; i++) {
    const x = a.slice(i - n + 1, i + 1);
    const y = b.slice(i - n + 1, i + 1);
    if (x.every(Number.isFinite) && y.every(Number.isFinite)) out[i] = f(x, y);
  }
  return out;
}
const IST_SECONDS = 19_800;
const minuteOfDay = (t: number) => Math.floor((((t + IST_SECONDS) % 86400) + 86400) % 86400 / 60);
const istDay = (t: number) => Math.floor((t + IST_SECONDS) / 86400);

/** Candles of `minutes` minutes (or whole days for 1440), grouped on the IST clock; `of[i]` is the group base candle i belongs to. */
function groupCandles(candles: Candle[], minutes: number): { groups: Candle[]; of: number[] } {
  const groups: Candle[] = [];
  const of: number[] = [];
  let key = "";
  let dayKey = -1;
  let open = 0; // minute of day the session's first candle starts: bigger candles count from there (09:15 for NSE, 00:00 for markets that run all day)
  for (const c of candles) {
    if (istDay(c.time) !== dayKey) {
      dayKey = istDay(c.time);
      open = minuteOfDay(c.time);
    }
    const k = minutes >= 1440 ? `${dayKey}` : `${dayKey}-${Math.floor((minuteOfDay(c.time) - open) / minutes)}`;
    const g = groups.at(-1);
    if (k === key && g) {
      g.high = Math.max(g.high, c.high);
      g.low = Math.min(g.low, c.low);
      g.close = c.close;
      g.volume += c.volume;
    } else {
      key = k;
      groups.push({ ...c });
    }
    of.push(groups.length - 1);
  }
  return { groups, of };
}
const lag = (x: Arr, n: number): Arr => x.map((_, i) => (i >= n ? x[i - n] : NaN));

/** Evaluates a parsed formula on candles: one value per candle (NaN where it isn't defined yet). */
/** `resolve` supplies the values of another custom indicator for ind(name). */
export type IndicatorResolver = (name: string, candles: Candle[]) => number[];

export function evaluateFormula(tree: Node, candles: Candle[], resolve?: IndicatorResolver): Arr {
  const len = candles.length;
  const cache = new Map<Node, Arr>();
  const ev = (n: Node): Arr => {
    const seen = cache.get(n);
    if (seen) return seen;
    const r = evalNode(n);
    cache.set(n, r);
    return r;
  };
  const evalNode = (n: Node): Arr => {
    switch (n.t) {
      case "num":
        return new Array<number>(len).fill(n.v);
      case "series":
        if (n.name === "range" || n.name === "body" || n.name === "upwick" || n.name === "lowwick" || n.name === "tr" || n.name === "barindex")
          return candles.map((c, i) =>
            n.name === "range" ? c.high - c.low : n.name === "body" ? c.close - c.open : n.name === "upwick" ? c.high - Math.max(c.open, c.close) : n.name === "lowwick" ? Math.min(c.open, c.close) - c.low : n.name === "barindex" ? i : i === 0 ? c.high - c.low : Math.max(c.high - c.low, Math.abs(c.high - candles[i - 1].close), Math.abs(c.low - candles[i - 1].close)),
          );
        return candles.map((c) =>
          n.name === "hl2" ? (c.high + c.low) / 2 : n.name === "hlc3" ? (c.high + c.low + c.close) / 3 : n.name === "ohlc4" ? (c.open + c.high + c.low + c.close) / 4 : c[n.name as "open" | "high" | "low" | "close" | "volume"],
        );
      case "neg":
        return ev(n.a).map((v) => -v);
      case "bin": {
        const a = ev(n.a);
        const b = ev(n.b);
        const f: (x: number, y: number) => number = {
          "+": (x: number, y: number) => x + y,
          "-": (x: number, y: number) => x - y,
          "*": (x: number, y: number) => x * y,
          "/": (x: number, y: number) => (y === 0 ? NaN : x / y),
          "^": (x: number, y: number) => x ** y,
          ">": (x: number, y: number) => +(x > y),
          "<": (x: number, y: number) => +(x < y),
          ">=": (x: number, y: number) => +(x >= y),
          "<=": (x: number, y: number) => +(x <= y),
          "==": (x: number, y: number) => +(x === y),
          "!=": (x: number, y: number) => +(x !== y),
          and: (x: number, y: number) => +(!!x && !!y),
          or: (x: number, y: number) => +(!!x || !!y),
        }[n.op];
        return a.map((x, i) => (Number.isFinite(x) && Number.isFinite(b[i]) ? f(x, b[i]) : NaN));
      }
      case "call":
        return call(n);
    }
  };
  const call = (n: Extract<Node, { t: "call" }>): Arr => {
    const f = n.fn;
    const num = (i: number) => constOf(n.args[i]);
    let out: Arr;
    const builtin = (kind: IndicatorKind, params: number[]) => {
      const pts = computeIndicatorSeries(candles, kind, params);
      const byTime = new Map(pts.map((p) => [p.time, p.value]));
      return candles.map((c) => byTime.get(c.time) ?? NaN);
    };
    if (n.args.length === 1 && CATALOG.has(f) && (WINDOW_FNS as readonly string[]).includes(f) && isConst(n.args[0])) {
      out = builtin(CATALOG.get(f)!.kind, [num(0)]);
    } else if (f === "sma") out = sma(ev(n.args[0]), num(1));
    else if (f === "ema") out = emaLike(ev(n.args[0]), 2 / (num(1) + 1), num(1));
    else if (f === "rma") out = emaLike(ev(n.args[0]), 1 / num(1), num(1));
    else if (f === "wma") out = wma(ev(n.args[0]), num(1));
    else if (f === "rsi") out = rsi(ev(n.args[0]), num(1));
    else if (f === "stdev")
      out = windowed(ev(n.args[0]), num(1), (w) => {
        const m = w.reduce((s, v) => s + v, 0) / w.length;
        return Math.sqrt(w.reduce((s, v) => s + (v - m) ** 2, 0) / w.length);
      });
    else if (f === "highest") out = windowed(ev(n.args[0]), num(1), (w) => Math.max(...w));
    else if (f === "lowest") out = windowed(ev(n.args[0]), num(1), (w) => Math.min(...w));
    else if (f === "sum") out = windowed(ev(n.args[0]), num(1), (w) => w.reduce((s, v) => s + v, 0));
    else if (f === "ref") out = lag(ev(n.args[0]), n.args.length > 1 ? num(1) : 1);
    else if (f === "change") {
      const x = ev(n.args[0]);
      const k = n.args.length > 1 ? num(1) : 1;
      out = x.map((v, i) => (i >= k ? v - x[i - k] : NaN));
    } else if (f === "roc") {
      const x = ev(n.args[0]);
      const k = n.args.length > 1 ? num(1) : 1;
      out = x.map((v, i) => (i >= k && x[i - k] ? ((v - x[i - k]) / x[i - k]) * 100 : NaN));
    } else if (f === "abs") out = ev(n.args[0]).map(Math.abs);
    else if (f === "sqrt") out = ev(n.args[0]).map((v) => (v >= 0 ? Math.sqrt(v) : NaN));
    else if (f === "log") out = ev(n.args[0]).map((v) => (v > 0 ? Math.log(v) : NaN));
    else if (f === "min" || f === "max") {
      const a = ev(n.args[0]);
      const b = ev(n.args[1]);
      out = a.map((v, i) => (f === "min" ? Math.min(v, b[i]) : Math.max(v, b[i])));
    } else if (f === "if") {
      const c = ev(n.args[0]);
      const a = ev(n.args[1]);
      const b = ev(n.args[2]);
      out = c.map((v, i) => (Number.isFinite(v) ? (v ? a[i] : b[i]) : NaN));
    } else if (f === "crossover" || f === "crossunder") {
      const a = ev(n.args[0]);
      const b = ev(n.args[1]);
      out = a.map((v, i) => (i && [v, b[i], a[i - 1], b[i - 1]].every(Number.isFinite) ? +(f === "crossover" ? a[i - 1] <= b[i - 1] && v > b[i] : a[i - 1] >= b[i - 1] && v < b[i]) : NaN));
    } else if ((MATH1_FNS as readonly string[]).includes(f)) {
      const fn: Record<string, (v: number) => number> = { exp: Math.exp, sin: Math.sin, cos: Math.cos, tan: Math.tan, floor: Math.floor, ceil: Math.ceil, round: Math.round, sign: Math.sign };
      out = ev(n.args[0]).map((v) => (f === "isna" ? +!Number.isFinite(v) : Number.isFinite(v) ? fn[f](v) : NaN));
    } else if (f === "nz") {
      const rep = n.args.length > 1 ? ev(n.args[1]) : null;
      out = ev(n.args[0]).map((v, i) => (Number.isFinite(v) ? v : rep ? rep[i] : 0));
    } else if (f === "pow" || f === "mod") {
      const a = ev(n.args[0]);
      const b = ev(n.args[1]);
      out = a.map((v, i) => (Number.isFinite(v) && Number.isFinite(b[i]) ? (f === "pow" ? v ** b[i] : b[i] === 0 ? NaN : v % b[i]) : NaN));
    } else if (f === "clamp") {
      const [x, lo, hi] = n.args.map(ev);
      out = x.map((v, i) => (Number.isFinite(v) && Number.isFinite(lo[i]) && Number.isFinite(hi[i]) ? Math.min(Math.max(v, lo[i]), hi[i]) : NaN));
    } else if (f === "median") {
      out = windowed(ev(n.args[0]), num(1), (w) => {
        const q = [...w].sort((a, b) => a - b);
        const m = q.length >> 1;
        return q.length % 2 ? q[m] : (q[m - 1] + q[m]) / 2;
      });
    } else if (f === "variance") out = windowed(ev(n.args[0]), num(1), (w) => stats(w).variance);
    else if (f === "zscore") out = windowed(ev(n.args[0]), num(1), (w) => (stats(w).sd === 0 ? NaN : (w[w.length - 1] - stats(w).mean) / stats(w).sd));
    else if (f === "percentrank") out = windowed(ev(n.args[0]), num(1), (w) => (w.filter((v) => v <= w[w.length - 1]).length / w.length) * 100);
    else if (f === "linreg") out = windowed(ev(n.args[0]), num(1), (w) => fit(w).last);
    else if (f === "slope") out = windowed(ev(n.args[0]), num(1), (w) => fit(w).slope);
    else if (f === "normalize") out = windowed(ev(n.args[0]), num(1), (w) => (Math.max(...w) === Math.min(...w) ? NaN : (w[w.length - 1] - Math.min(...w)) / (Math.max(...w) - Math.min(...w))));
    else if (f === "skew") out = windowed(ev(n.args[0]), num(1), (w) => (stats(w).sd === 0 ? NaN : w.reduce((s, v) => s + ((v - stats(w).mean) / stats(w).sd) ** 3, 0) / w.length));
    else if (f === "percentile")
      out = windowed(ev(n.args[0]), num(1), (w) => {
        const q = [...w].sort((a, b) => a - b);
        const pos = (num(2) / 100) * (q.length - 1);
        const lo = Math.floor(pos);
        return q[lo] + (q[Math.min(lo + 1, q.length - 1)] - q[lo]) * (pos - lo);
      });
    else if (f === "correlation" || f === "covariance")
      out = windowed2(ev(n.args[0]), ev(n.args[1]), num(2), (x, y) => {
        const mx = x.reduce((s, v) => s + v, 0) / x.length;
        const my = y.reduce((s, v) => s + v, 0) / y.length;
        const cov = x.reduce((s, v, i) => s + (v - mx) * (y[i] - my), 0) / x.length;
        if (f === "covariance") return cov;
        const d = stats(x).sd * stats(y).sd;
        return d === 0 ? NaN : cov / d;
      });
    else if (f === "barssince") {
      const c = ev(n.args[0]);
      let last = -1;
      out = c.map((v, i) => {
        if (truthy(v)) last = i;
        return last < 0 ? NaN : i - last;
      });
    } else if (f === "streak") {
      let run = 0;
      out = ev(n.args[0]).map((v) => (Number.isFinite(v) ? (run = truthy(v) ? run + 1 : 0) : (run = 0, NaN)));
    } else if (f === "cum") {
      let total = 0;
      out = ev(n.args[0]).map((v) => (Number.isFinite(v) ? (total += v) : total));
    } else if (f === "valuewhen") {
      const c = ev(n.args[0]);
      const x = ev(n.args[1]);
      const k = n.args.length > 2 ? num(2) : 0;
      const seen: number[] = [];
      out = c.map((v, i) => {
        if (truthy(v)) seen.push(x[i]);
        return seen.length > k ? seen[seen.length - 1 - k] : NaN;
      });
    } else if (f === "rising" || f === "falling") {
      const x = ev(n.args[0]);
      const k = num(1);
      out = x.map((_, i) => {
        if (i < k) return NaN;
        for (let j = 0; j < k; j++) {
          const a = x[i - j];
          const b = x[i - j - 1];
          if (!Number.isFinite(a) || !Number.isFinite(b)) return NaN;
          if (f === "rising" ? !(a > b) : !(a < b)) return 0;
        }
        return 1;
      });
    } else if ((PIVOT_FNS as readonly string[]).includes(f)) {
      const k = num(0);
      const high = f === "pivothigh" || f === "swinghigh";
      const price = candles.map((c) => (high ? c.high : c.low));
      const found = nan(len);
      for (let i = 2 * k; i < len; i++) {
        const j = i - k;
        let ok = true;
        for (let m = j - k; m <= j + k && ok; m++) if (m !== j && (high ? price[m] >= price[j] : price[m] <= price[j])) ok = false;
        if (ok) found[i] = price[j];
      }
      if (f === "pivothigh" || f === "pivotlow") out = found;
      else {
        let held = NaN;
        out = found.map((v) => (Number.isFinite(v) ? (held = v) : held));
      }
    } else if (f === "ind") {
      if (!resolve) throw new FormulaError(`“${n.ref}” is another custom indicator, which isn't attached to this one. Save this indicator again so it can be linked.`);
      out = resolve(n.ref!, candles);
    } else if (f === "fvgbull" || f === "fvgbear") {
      out = candles.map((c, i) => (i < 2 ? NaN : +(f === "fvgbull" ? c.low > candles[i - 2].high : c.high < candles[i - 2].low)));
    } else if (f === "fvgbullmid" || f === "fvgbearmid") {
      const bull = f === "fvgbullmid";
      let top = NaN;
      let bottom = NaN;
      out = candles.map((c, i) => {
        if (i >= 2) {
          if (bull && c.low > candles[i - 2].high) [top, bottom] = [c.low, candles[i - 2].high];
          if (!bull && c.high < candles[i - 2].low) [top, bottom] = [candles[i - 2].low, c.high];
        }
        // A gap is filled (mitigated) when price closes through it; then there is no live gap until the next one forms.
        if (Number.isFinite(top) && (bull ? c.close < bottom : c.close > top)) top = bottom = NaN;
        return Number.isFinite(top) ? (top + bottom) / 2 : NaN;
      });
    } else if (f === "eqhigh" || f === "eqlow") {
      const k = num(0);
      const tol = num(1) / 100;
      out = candles.map((c, i) => {
        if (i < k) return NaN;
        const prev = candles.slice(i - k, i).map((x) => (f === "eqhigh" ? x.high : x.low));
        const ref = f === "eqhigh" ? Math.max(...prev) : Math.min(...prev);
        const here = f === "eqhigh" ? c.high : c.low;
        return +(Math.abs(here - ref) <= Math.abs(ref) * tol);
      });
    } else if (f === "sweephigh" || f === "sweeplow") {
      const k = num(0);
      out = candles.map((c, i) => {
        if (i < k) return NaN;
        const prev = candles.slice(i - k, i);
        return f === "sweephigh" ? +(c.high > Math.max(...prev.map((x) => x.high)) && c.close < Math.max(...prev.map((x) => x.high))) : +(c.low < Math.min(...prev.map((x) => x.low)) && c.close > Math.min(...prev.map((x) => x.low)));
      });
    } else if (f === "bosup" || f === "bosdown" || f === "obbullhigh" || f === "obbulllow" || f === "obbearhigh" || f === "obbearlow") {
      const k = num(0);
      const up = f === "bosup" || f.startsWith("obbull");
      // The latest confirmed swing (shown k candles after it forms), then a close through it is the break.
      const swing = nan(len);
      let held = NaN;
      for (let i = 0; i < len; i++) {
        const j = i - k;
        if (j >= k) {
          let ok = true;
          for (let m = j - k; m <= j + k && ok; m++) if (m !== j && (up ? candles[m].high >= candles[j].high : candles[m].low <= candles[j].low)) ok = false;
          if (ok) held = up ? candles[j].high : candles[j].low;
        }
        swing[i] = held;
      }
      const broke = candles.map((c, i) => (i > 0 && Number.isFinite(swing[i - 1]) ? (up ? c.close > swing[i - 1] && candles[i - 1].close <= swing[i - 1] : c.close < swing[i - 1] && candles[i - 1].close >= swing[i - 1]) : false));
      if (f === "bosup" || f === "bosdown") out = candles.map((_, i) => (Number.isFinite(swing[i]) ? +broke[i] : NaN));
      else {
        // Order block: the last opposite-coloured candle before the break, kept until price closes through the far side of it.
        const wantHigh = f.endsWith("high");
        let zone: { high: number; low: number } | null = null;
        out = candles.map((c, i) => {
          if (broke[i]) {
            for (let j = i - 1; j >= 0 && j >= i - 50; j--) {
              if (up ? candles[j].close < candles[j].open : candles[j].close > candles[j].open) {
                zone = { high: candles[j].high, low: candles[j].low };
                break;
              }
            }
          }
          if (zone && (up ? c.close < zone.low : c.close > zone.high)) zone = null;
          return zone ? (wantHigh ? zone.high : zone.low) : NaN;
        });
      }
    } else if ((TIME_FNS as readonly string[]).includes(f)) {
      out = candles.map((c) => (f === "hour" ? Math.floor(minuteOfDay(c.time) / 60) : f === "minute" ? minuteOfDay(c.time) % 60 : f === "minuteofday" ? minuteOfDay(c.time) : ((new Date((c.time + IST_SECONDS) * 1000).getUTCDay() + 6) % 7) + 1));
    } else if (f === "htf") {
      // The bigger candle's value is shown only once that candle has closed: every base candle reads the PREVIOUS bigger candle, so nothing changes afterwards.
      const { groups, of } = groupCandles(candles, num(0));
      const big = evaluateFormula(n.args[1], groups, resolve);
      out = of.map((g) => (g > 0 ? big[g - 1] : NaN));
    } else {
      const def = CATALOG.get(f)!;
      const params = def.defaults.map((d, i) => (i < n.args.length ? num(i) : d));
      out = builtin(def.kind, params);
    }
    return out;
  };
  return ev(tree);
}

/** Every name a formula can use, for the editor's help panel. */
export const FORMULA_REFERENCE = {
  series: [...SERIES],
  window: [...WINDOW_FNS],
  math: [...MATH_FNS, ...MATH1_FNS, "nz", "pow", "mod", "clamp"],
  statistics: [...STAT_FNS, "percentile", "correlation", "covariance"],
  memory: [...STATE_FNS],
  swings: [...PIVOT_FNS],
  structure: [...STRUCTURE_FNS],
  clock: [...TIME_FNS],
  higherTimeframe: ["htf"],
  notes: FORMULA_FUNCTION_NOTES,
  indicators: INDICATOR_CATALOG.map((d) => ({ name: d.dslName, settings: d.paramLabels, defaults: d.defaults, label: d.label })),
};
