// Runs the agent test set against Bedrock and prints a scorecard.
//   AWS_PROFILE=myalgoagent-admin npx tsx scripts/agent-eval.ts [modelId]
// Uses the same system prompt and guardrail as production. Costs a fraction
// of a cent per full run on Nova models.

import { converse } from "../src/lib/ai/bedrock";
import { AI_MODELS } from "../src/lib/ai/config";
import { buildSystemPrompt } from "../src/lib/ai/system-prompt";
import { EVAL_CASES, type EvalCase } from "../src/lib/ai/evals/cases";

const PRICES: Record<string, [number, number]> = {
  // USD per 1M tokens, ap-south-1 (AWS price list, 2026-09-24)
  "global.amazon.nova-2-lite-v1:0": [0.35, 2.95],
  "apac.amazon.nova-lite-v1:0": [0.07, 0.28],
  "apac.amazon.nova-micro-v1:0": [0.041, 0.164],
  "global.anthropic.claude-haiku-4-5-20251001-v1:0": [1, 5],
};

function check(c: EvalCase, reply: string): string[] {
  const fails: string[] = [];
  for (const re of c.mustMatch ?? []) if (!re.test(reply)) fails.push(`missing ${re}`);
  for (const re of c.mustNotMatch ?? []) if (re.test(reply)) fails.push(`contains ${re}`);
  if (c.maxChars && reply.length > c.maxChars) fails.push(`too long (${reply.length} > ${c.maxChars})`);
  return fails;
}

async function main() {
  const model = process.argv[2] ?? AI_MODELS.main;
  const system = buildSystemPrompt("Nova");
  let pass = 0;
  let inTok = 0;
  let outTok = 0;
  let latency = 0;
  const byGroup: Record<string, [number, number]> = {};

  for (const c of EVAL_CASES) {
    const r = await converse({ model, system, turns: [{ role: "user", text: c.prompt }] });
    const reply = r.guardrailHit ? "[guardrail] I can't help with that — I don't give buy or sell calls." : r.text;
    const fails = check(c, reply);
    const ok = fails.length === 0;
    if (ok) pass++;
    inTok += r.inputTokens ?? 0;
    outTok += r.outputTokens ?? 0;
    latency += r.latencyMs;
    const g = (byGroup[c.group] ??= [0, 0]);
    g[1]++;
    if (ok) g[0]++;
    console.log(`${ok ? "PASS" : "FAIL"}  [${c.group}] ${c.prompt}`);
    if (!ok || process.env.VERBOSE) {
      console.log(`      ${fails.join("; ")}`);
      console.log(`      ↳ ${reply.replace(/\n/g, " ⏎ ").slice(0, 400)}`);
    }
  }

  const [pin, pout] = PRICES[model] ?? [0, 0];
  const cost = (inTok * pin + outTok * pout) / 1e6;
  console.log(`\nModel: ${model}`);
  console.log(`Score: ${pass}/${EVAL_CASES.length}`);
  for (const [g, [p, t]] of Object.entries(byGroup)) console.log(`  ${g.padEnd(12)} ${p}/${t}`);
  console.log(`Tokens: ${inTok} in / ${outTok} out — ≈ $${cost.toFixed(4)} for the run, ≈ $${(cost / EVAL_CASES.length).toFixed(5)} per message`);
  console.log(`Avg latency: ${Math.round(latency / EVAL_CASES.length)} ms`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
