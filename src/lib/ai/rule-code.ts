import { parseDsl, DslSyntaxError, INDICATOR_CATALOG } from "@/lib/strategy";

// "Write it for me" for the strategy builder's code editor: the user says what the rule should do, the model answers with
// one expression in the platform's own rule syntax, and nothing is handed back unless it parses. A failed attempt is
// shown to the model once with the parser's message, so it can correct itself. Pure apart from the `ask` it is given.

export type RuleCodePart = "entry" | "exit";

const SYNTAX = INDICATOR_CATALOG.map((d) => `${d.dslName}(${d.defaults.join(", ")})${d.paramLabels.length ? ` — ${d.label}: ${d.paramLabels.join(", ")}` : ` — ${d.label}`}`).join("\n");

export const RULE_CODE_SYSTEM = `You write trading rules in MyAlgoAgent's rule syntax. Answer with ONE expression and nothing else — no prose, no markdown, no quotes.

The syntax:
- Prices of the current candle: open, high, low, close, volume.
- Numbers: 70, 0.5, 100.
- Indicators are called with their numbers, e.g. sma(20), ema(50), rsi(14), atr(14). The full list with default settings is below.
- Comparisons: a > b, a < b, a >= b, a <= b, a == b, a crossesAbove b, a crossesBelow b.
- Combine with and, or, not, and ( ) for grouping.
- Examples: "sma(20) crossesAbove ema(50) and rsi(14) < 70"   "close < bollingerLower(20, 2) or rsi(14) < 30"   "not (rsi(14) > 70)"

When a "Current rule" is given, change only what the user asks for and keep the rest of it.

Use only names from the list below. Do not invent indicators. If the idea can't be written in this syntax (for example it needs a time of day, another stock or a chart pattern), write the closest rule you can and nothing more.

Indicators:
${SYNTAX}`;

/** The expression inside a model's reply: the first code block if there is one, otherwise the first non-empty line, without quotes or a trailing explanation. */
export function extractRule(reply: string): string {
  const fenced = /```(?:[a-z]*)\n?([\s\S]*?)```/i.exec(reply);
  const body = (fenced ? fenced[1] : reply).trim();
  const line = body.split(/\r?\n/).map((l) => l.trim()).find((l) => l && !/^(here|this|rule|expression|answer)\b.*:$/i.test(l)) ?? "";
  return line.replace(/^["'`]+|["'`]+$/g, "").replace(/;$/, "").trim();
}

export function checkRule(code: string): string | null {
  try {
    parseDsl(code);
    return null;
  } catch (err) {
    return err instanceof DslSyntaxError ? `line ${err.line}, column ${err.column}: ${err.message}` : err instanceof Error ? err.message : "not a valid rule";
  }
}

export type AskModel = (system: string, user: string) => Promise<string>;

/** A request to the model: what the user wants, for which part, and (when fixing) the code and the parser's complaint. */
export function rulePrompt(a: { description: string; part: RuleCodePart; current?: string; problem?: string }): string {
  const what = a.part === "entry" ? "the ENTRY rule (when to open a position)" : "the EXIT rule (when to close a position)";
  if (a.problem && a.current) return `Fix this ${a.part} rule so it parses. The parser said: ${a.problem}\n\nCurrent rule:\n${a.current}\n\nWhat the user wants: ${a.description || "keep the same idea"}`;
  return `Write ${what}.${a.current?.trim() ? `\n\nCurrent rule: ${a.current.trim()}` : ""}\n\nWhat the user wants: ${a.description}`;
}

export async function writeRule(ask: AskModel, a: { description: string; part: RuleCodePart; current?: string; problem?: string }): Promise<{ ok: true; code: string; retried: boolean } | { ok: false; error: string }> {
  let prompt = rulePrompt(a);
  let lastProblem = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const code = extractRule(await ask(RULE_CODE_SYSTEM, prompt));
    if (!code) return { ok: false, error: "No rule came back. Try describing it differently." };
    const problem = checkRule(code);
    if (!problem) return { ok: true, code, retried: attempt > 0 };
    lastProblem = problem;
    prompt = `${rulePrompt(a)}\n\nYour previous answer was:\n${code}\nThe parser rejected it: ${problem}\nAnswer again with one corrected expression.`;
  }
  return { ok: false, error: `Couldn't write a rule that parses (${lastProblem}). Try a simpler description, or write it by hand.` };
}
