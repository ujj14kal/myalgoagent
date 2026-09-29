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
  | { t: "call"; fn: string; args: Node[] };

const SERIES = ["open", "high", "low", "close", "volume", "hl2", "hlc3", "ohlc4"] as const;
type SeriesName = (typeof SERIES)[number];

/** Functions over any series: fn(source, length). */
const WINDOW_FNS = ["sma", "ema", "wma", "rma", "rsi", "stdev", "highest", "lowest", "sum", "change", "ref", "roc"] as const;
const MATH_FNS = ["abs", "sqrt", "log", "min", "max", "if", "crossover", "crossunder"] as const;
/** Built-in indicators callable by name with numeric settings, e.g. atr(14), supertrend(10, 3). */
const CATALOG = new Map(INDICATOR_CATALOG.map((d) => [d.dslName, d]));

export class FormulaError extends Error {}

const MAX_LENGTH = 500;
const MAX_NODES = 200;
const MAX_WINDOW = 1000;

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

/** Parses and checks a formula. Throws FormulaError with a plain-English reason. */
export function parseFormula(src: string): Node {
  const text = src.trim();
  if (!text) throw new FormulaError("Write a formula, e.g. ema(close, 20) - ema(close, 50).");
  if (text.length > MAX_LENGTH) throw new FormulaError(`Keep formulas under ${MAX_LENGTH} characters.`);
  const toks = tokenize(text);
  let p = 0;
  let nodes = 0;
  const peek = () => toks[p];
  const node = <T extends Node>(n: T): T => {
    if (++nodes > MAX_NODES) throw new FormulaError("That formula is too long — split it into two custom indicators.");
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
      if ((SERIES as readonly string[]).includes(t.v)) return node({ t: "series", name: t.v as SeriesName });
      throw new FormulaError(`Unknown name "${t.v}". Use open, high, low, close, volume, hl2, hlc3 or ohlc4, or a function like sma(close, 20).`);
    }
    throw new FormulaError("Something's missing between the operators.");
  };

  const tree = or();
  if (p < toks.length) throw new FormulaError("There's extra text after the formula — check brackets and commas.");
  check(tree);
  return tree;
}

const isConst = (n: Node): n is { t: "num"; v: number } => n.t === "num" || (n.t === "neg" && n.a.t === "num");
const constOf = (n: Node) => (n.t === "num" ? n.v : n.t === "neg" && n.a.t === "num" ? -n.a.v : NaN);

function check(n: Node): void {
  if (n.t === "neg") return check(n.a);
  if (n.t === "bin") return (check(n.a), check(n.b));
  if (n.t !== "call") return;
  n.args.forEach(check);
  const f = n.fn;
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
const lag = (x: Arr, n: number): Arr => x.map((_, i) => (i >= n ? x[i - n] : NaN));

/** Evaluates a parsed formula on candles: one value per candle (NaN where it isn't defined yet). */
export function evaluateFormula(tree: Node, candles: Candle[]): Arr {
  const len = candles.length;
  const cache = new Map<string, Arr>();
  const ev = (n: Node): Arr => {
    switch (n.t) {
      case "num":
        return new Array<number>(len).fill(n.v);
      case "series":
        return candles.map((c) =>
          n.name === "hl2" ? (c.high + c.low) / 2 : n.name === "hlc3" ? (c.high + c.low + c.close) / 3 : n.name === "ohlc4" ? (c.open + c.high + c.low + c.close) / 4 : c[n.name],
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
    const key = JSON.stringify(n);
    const hit = cache.get(key);
    if (hit) return hit;
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
    } else {
      const def = CATALOG.get(f)!;
      const params = def.defaults.map((d, i) => (i < n.args.length ? num(i) : d));
      out = builtin(def.kind, params);
    }
    cache.set(key, out);
    return out;
  };
  return ev(tree);
}

/** Every name a formula can use, for the editor's help panel. */
export const FORMULA_REFERENCE = {
  series: [...SERIES],
  window: [...WINDOW_FNS],
  math: [...MATH_FNS],
  indicators: INDICATOR_CATALOG.map((d) => ({ name: d.dslName, settings: d.paramLabels, defaults: d.defaults, label: d.label })),
};
