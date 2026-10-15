// The visual block builder's brain: blocks wired together become a formula (named steps, the last line the indicator itself).
// Pure, so every kind of block and every way of getting it wrong is tested. The canvas lives in components/custom-indicators/block-builder.tsx.

export type BlockType = "price" | "number" | "window" | "indicator" | "math" | "compare" | "logic" | "output";

export type Block = {
  id: string;
  type: BlockType;
  /** Which price, function or operator the block is. */
  op: string;
  /** Typed-in numbers: a length, a multiplier, a constant. */
  nums: number[];
  /** Block ids feeding each input (null = nothing wired yet). */
  inputs: (string | null)[];
  x: number;
  y: number;
};

export type BlockSpec = { label: string; inputs: string[]; params: { label: string; def: number }[]; hint: string };

export const PRICES = ["open", "high", "low", "close", "volume", "hl2", "hlc3", "ohlc4", "range", "body", "upwick", "lowwick", "tr"];

const win = (label: string, hint: string, extra: { label: string; def: number }[] = [{ label: "length", def: 14 }]): BlockSpec => ({ label, inputs: ["source"], params: extra, hint });

/** Functions over a source and a length (and the like). */
export const WINDOW_BLOCKS: Record<string, BlockSpec> = {
  sma: win("Simple average", "Average of the last n values"),
  ema: win("Exponential average", "Average that weights recent values more"),
  wma: win("Weighted average", "Average weighted by recency"),
  rma: win("Smoothed average (RMA)", "Wilder's smoothing"),
  rsi: win("RSI", "Relative strength index of the source"),
  stdev: win("Standard deviation", "Spread of the last n values"),
  highest: win("Highest", "Highest of the last n values"),
  lowest: win("Lowest", "Lowest of the last n values"),
  sum: win("Sum", "Sum of the last n values"),
  change: win("Change", "Value now minus the value n back", [{ label: "bars back", def: 1 }]),
  ref: win("Value n bars ago", "The value n back", [{ label: "bars back", def: 1 }]),
  roc: win("Rate of change %", "Percent change over n bars", [{ label: "bars back", def: 10 }]),
  median: win("Median", "Middle value of the last n"),
  variance: win("Variance", "Spread squared"),
  zscore: win("Z-score", "Standard deviations from the n-bar mean", [{ label: "length", def: 20 }]),
  percentrank: win("Percent rank", "Share of the last n values at or below this one", [{ label: "length", def: 50 }]),
  linreg: win("Regression value", "Where the fitted line is now"),
  slope: win("Regression slope", "Slope per bar of the fitted line"),
  normalize: win("Normalize 0–1", "Position inside the n-bar range"),
  kalman: win("Kalman estimate", "Statistical estimate of the level", [{ label: "movement", def: 0.01 }, { label: "noise", def: 1 }]),
  fisher: win("Fisher transform", "Sharpens turning points", [{ label: "length", def: 10 }]),
  barssince: { label: "Bars since true", inputs: ["condition"], params: [], hint: "Candles since the condition was last true" },
  streak: { label: "Streak of true", inputs: ["condition"], params: [], hint: "How many candles in a row it has been true" },
  cum: { label: "Running total", inputs: ["source"], params: [], hint: "Adds up every value so far" },
  htf: win("Bigger candle (closed)", "The source worked out on bigger closed candles", [{ label: "minutes (5, 15, 30, 60, 240, 1440)", def: 60 }]),
};

/** Built-in indicators that need only settings. */
export const INDICATOR_BLOCKS: Record<string, BlockSpec> = {
  atr: { label: "ATR", inputs: [], params: [{ label: "length", def: 14 }], hint: "Average true range" },
  adx: { label: "ADX", inputs: [], params: [{ label: "length", def: 14 }], hint: "Trend strength" },
  cci: { label: "CCI", inputs: [], params: [{ label: "length", def: 20 }], hint: "Commodity channel index" },
  mfi: { label: "Money flow index", inputs: [], params: [{ label: "length", def: 14 }], hint: "Volume-weighted RSI" },
  vwap: { label: "VWAP", inputs: [], params: [], hint: "Volume-weighted average price for the session" },
  obv: { label: "On-balance volume", inputs: [], params: [], hint: "Running volume by direction" },
  supertrend: { label: "Supertrend", inputs: [], params: [{ label: "length", def: 10 }, { label: "multiplier", def: 3 }], hint: "Trend-following line" },
  fvgbull: { label: "Bullish fair value gap", inputs: [], params: [], hint: "1 on the candle that completes a gap up" },
  fvgbear: { label: "Bearish fair value gap", inputs: [], params: [], hint: "1 on the candle that completes a gap down" },
  swinghigh: { label: "Latest swing high", inputs: [], params: [{ label: "bars each side", def: 5 }], hint: "Latest confirmed swing high" },
  swinglow: { label: "Latest swing low", inputs: [], params: [{ label: "bars each side", def: 5 }], hint: "Latest confirmed swing low" },
  bosup: { label: "Break of structure up", inputs: [], params: [{ label: "bars each side", def: 5 }], hint: "1 when price closes above the swing high" },
  bosdown: { label: "Break of structure down", inputs: [], params: [{ label: "bars each side", def: 5 }], hint: "1 when price closes below the swing low" },
  sweephigh: { label: "Liquidity sweep up", inputs: [], params: [{ label: "candles", def: 20 }], hint: "Pokes above recent highs and closes back below" },
  sweeplow: { label: "Liquidity sweep down", inputs: [], params: [{ label: "candles", def: 20 }], hint: "Pokes below recent lows and closes back above" },
  minuteofday: { label: "Minute of day (IST)", inputs: [], params: [], hint: "09:15 = 555" },
};

const bin = (label: string, hint: string): BlockSpec => ({ label, inputs: ["a", "b"], params: [], hint });
const un = (label: string, hint: string): BlockSpec => ({ label, inputs: ["value"], params: [], hint });
export const MATH_BLOCKS: Record<string, BlockSpec> = {
  "+": bin("Add", "a + b"), "-": bin("Subtract", "a − b"), "*": bin("Multiply", "a × b"), "/": bin("Divide", "a ÷ b"), "^": bin("Power", "a to the power b"),
  min: bin("Smaller of", "The lower of a and b"), max: bin("Larger of", "The higher of a and b"),
  abs: un("Absolute value", "Without the sign"), sqrt: un("Square root", "√value"), log: un("Natural log", "ln(value)"), exp: un("Exponential", "e to the value"), sign: un("Sign", "−1, 0 or 1"),
  clamp: { label: "Keep between", inputs: ["value"], params: [{ label: "lowest", def: 0 }, { label: "highest", def: 100 }], hint: "Limits the value to a range" },
};
export const COMPARE_BLOCKS: Record<string, BlockSpec> = {
  ">": bin("a is above b", "1 when a > b"), "<": bin("a is below b", "1 when a < b"), ">=": bin("a is at or above b", "1 when a ≥ b"), "<=": bin("a is at or below b", "1 when a ≤ b"), "==": bin("a equals b", "1 when equal"),
  crossover: bin("a crosses above b", "1 on the candle a moves from under to over b"), crossunder: bin("a crosses below b", "1 on the candle a moves from over to under b"),
};
export const LOGIC_BLOCKS: Record<string, BlockSpec> = {
  and: bin("Both true (and)", "1 when a and b are true"), or: bin("Either true (or)", "1 when a or b is true"),
  if: { label: "If … then … else", inputs: ["condition", "then", "else"], params: [], hint: "Picks one of two values" },
};

export const SPECS: Record<BlockType, Record<string, BlockSpec>> = {
  price: Object.fromEntries(PRICES.map((p) => [p, { label: p, inputs: [], params: [], hint: "A price from each candle" }])),
  number: { number: { label: "Number", inputs: [], params: [{ label: "value", def: 0 }], hint: "A fixed number" } },
  window: WINDOW_BLOCKS,
  indicator: INDICATOR_BLOCKS,
  math: MATH_BLOCKS,
  compare: COMPARE_BLOCKS,
  logic: LOGIC_BLOCKS,
  output: { output: { label: "The indicator", inputs: ["result"], params: [], hint: "What the indicator shows" } },
};

export const specOf = (b: Pick<Block, "type" | "op">): BlockSpec | undefined => SPECS[b.type]?.[b.op];

export const newBlock = (type: BlockType, op: string, x: number, y: number, id: string): Block => {
  const spec = SPECS[type][op];
  return { id, type, op, nums: spec.params.map((p) => p.def), inputs: spec.inputs.map(() => null), x, y };
};

const num = (n: number) => (Number.isInteger(n) ? String(n) : String(Number(n.toPrecision(10))));

export type Compiled = { ok: true; formula: string; steps: number } | { ok: false; error: string; blockId?: string };

/** Would wiring `from` into `into` make a loop? (A block can't feed itself, directly or through others.) */
export function wouldLoop(blocks: Block[], from: string, into: string): boolean {
  const byId = new Map(blocks.map((b) => [b.id, b]));
  const seen = new Set<string>();
  const reaches = (id: string): boolean => {
    if (id === into) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return (byId.get(id)?.inputs ?? []).some((i) => i !== null && reaches(i));
  };
  // `from` feeds `into`; a loop exists if `from` already depends on `into`.
  return from === into || reaches(from);
}

/** Wires into a formula: every block used more than once becomes a named step, the output block the last line. */
export function compileGraph(blocks: Block[]): Compiled {
  const out = blocks.filter((b) => b.type === "output");
  if (out.length !== 1) return { ok: false, error: out.length === 0 ? "Add the output block: the one that is the indicator itself." : "Keep only one output block." };
  const byId = new Map(blocks.map((b) => [b.id, b]));
  const steps: { name: string; expr: string }[] = [];
  const named = new Map<string, string>();
  const uses = new Map<string, number>();
  // How many blocks read each block, to decide which become steps.
  const count = (id: string, seen = new Set<string>()) => {
    uses.set(id, (uses.get(id) ?? 0) + 1);
    if (seen.has(id)) return;
    seen.add(id);
    for (const i of byId.get(id)?.inputs ?? []) if (i) count(i, seen);
  };
  const root = out[0];
  if (!root.inputs[0]) return { ok: false, error: "Wire something into the output block.", blockId: root.id };
  count(root.inputs[0]);

  let failed: { error: string; blockId: string } | null = null;
  const visiting = new Set<string>();
  const exprOf = (id: string): string => {
    if (named.has(id)) return named.get(id)!;
    const b = byId.get(id);
    if (!b) {
      failed ??= { error: "A wire points at a block that no longer exists.", blockId: id };
      return "0";
    }
    if (visiting.has(id)) {
      failed ??= { error: "The blocks loop back on themselves.", blockId: id };
      return "0";
    }
    visiting.add(id);
    const spec = specOf(b);
    if (!spec) {
      failed ??= { error: `“${b.op}” isn't a block this builder knows.`, blockId: id };
      visiting.delete(id);
      return "0";
    }
    const args = b.inputs.map((i, k) => {
      if (!i) {
        failed ??= { error: `“${spec.label}” is missing its ${spec.inputs[k] ?? "input"}: wire a block into it.`, blockId: id };
        return "0";
      }
      return exprOf(i);
    });
    const p = b.nums.map(num);
    let expr: string;
    switch (b.type) {
      case "price":
        expr = b.op;
        break;
      case "number":
        expr = Number(b.nums[0]) < 0 ? `(${p[0]})` : p[0];
        break;
      case "window":
        expr = b.op === "barssince" || b.op === "streak" || b.op === "cum" ? `${b.op}(${args[0]})` : `${b.op}(${[args[0], ...p].join(", ")})`;
        break;
      case "indicator":
        expr = `${b.op}(${p.join(", ")})`;
        break;
      case "math":
        expr = ["+", "-", "*", "/", "^"].includes(b.op) ? `(${args[0]} ${b.op} ${args[1]})` : b.op === "clamp" ? `clamp(${[args[0], ...p].join(", ")})` : `${b.op}(${args.join(", ")})`;
        break;
      case "compare":
        expr = b.op === "crossover" || b.op === "crossunder" ? `${b.op}(${args[0]}, ${args[1]})` : `(${args[0]} ${b.op} ${args[1]})`;
        break;
      case "logic":
        expr = b.op === "if" ? `if(${args.join(", ")})` : `(${args[0]} ${b.op} ${args[1]})`;
        break;
      default:
        expr = args[0];
    }
    visiting.delete(id);
    // Anything used in more than one place, or that is long, gets its own named step so the formula stays readable.
    if (b.type !== "price" && b.type !== "number" && ((uses.get(id) ?? 0) > 1 || expr.length > 60)) {
      const name = `${b.type === "window" || b.type === "indicator" ? b.op : b.type}_${steps.length + 1}`.replace(/[^a-z0-9_]/g, "");
      steps.push({ name, expr });
      named.set(id, name);
      return name;
    }
    return expr;
  };
  const last = exprOf(root.inputs[0]);
  if (failed) return { ok: false, ...(failed as { error: string; blockId: string }) };
  const lines = [...steps.map((s) => `${s.name} = ${s.expr}`), last];
  return { ok: true, formula: lines.join("\n"), steps: steps.length };
}
