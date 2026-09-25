// Runs the agent test set against one or more models and prints a scorecard.
//   AWS_PROFILE=myalgoagent-admin npx tsx --env-file=.env.local scripts/agent-eval.ts [modelId ...] [--user email] [--out file.json]
// Model ids use the same form as AI_MODELS ("mantle:openai.gpt-oss-120b" or a
// Bedrock runtime id). Uses the production system prompt and guardrail.
// Costs a few cents per model for a full run.

import { writeFileSync } from "node:fs";
import { converse } from "../src/lib/ai/bedrock";
import { AI_BLOCKED_REPLY, AI_MODELS } from "../src/lib/ai/config";
import { buildSystemPrompt } from "../src/lib/ai/system-prompt";
import { EVAL_CASES, type EvalCase } from "../src/lib/ai/evals/cases";
import { AGENT_TOOLS, runAgentTool } from "../src/lib/ai/tools";
import type { ToolRunner } from "../src/lib/ai/bedrock";
import type { AgentProposal } from "../src/lib/ai/proposals";

// USD per 1M tokens (input, output), ap-south-1 — AWS price list, 2026-09-24.
const PRICES: Record<string, [number, number]> = {
  "global.amazon.nova-2-lite-v1:0": [0.35, 2.95],
  "mantle:openai.gpt-oss-120b": [0.18, 0.71],
  "mantle:openai.gpt-oss-20b": [0.08, 0.35],
  "mantle:qwen.qwen3-235b-a22b-2507": [0.26, 1.04],
  "mantle:deepseek.v3.2": [0.74, 2.22],
  "mantle:mistral.mistral-large-3-675b-instruct": [0.59, 1.76],
  "mantle:moonshotai.kimi-k2.5": [0.72, 3.6],
  "mantle:zai.glm-4.7": [0.72, 2.64],
};

// Checked on every reply: leaked reasoning or raw markup the user should never see.
const ALWAYS_BAD = [/<\/?think>/i, /^\s*(analysis|reasoning)\s*:/im, /<\|[a-z_]+\|>/i];

function check(c: EvalCase, reply: string, proposal?: AgentProposal): string[] {
  const fails: string[] = [];
  const byProposal = !!c.passIfProposal && (proposal?.kind === c.passIfProposal || (proposal?.kind === "plan" && proposal.steps.some((s) => s.kind === c.passIfProposal)));
  if (!byProposal) for (const re of c.mustMatch ?? []) if (!re.test(reply)) fails.push(`missing ${re}`);
  for (const re of [...(c.mustNotMatch ?? []), ...ALWAYS_BAD]) if (re.test(reply)) fails.push(`contains ${re}`);
  if (c.maxChars && reply.length > c.maxChars) fails.push(`too long (${reply.length} > ${c.maxChars})`);
  if (!reply.trim() && !proposal) fails.push("empty reply");
  return fails;
}

type Row = { group: string; prompt: string; reply: string; ok: boolean; fails: string[]; ms: number; inTok: number; outTok: number };

async function runModel(model: string, system: string, runTool?: ToolRunner): Promise<Row[]> {
  const rows: Row[] = [];
  // A few at a time — fast, but gentle on rate limits.
  const queue = [...EVAL_CASES];
  async function worker() {
    for (let c = queue.shift(); c; c = queue.shift()) {
      try {
        const r = await converse({ model, system, turns: [{ role: "user", text: c.prompt }], ...(runTool ? { tools: AGENT_TOOLS, runTool } : {}) });
        const reply = r.guardrailHit ? AI_BLOCKED_REPLY : r.text;
        const fails = check(c, reply, r.proposal);
        rows.push({ group: c.group, prompt: c.prompt, reply, ok: fails.length === 0, fails, ms: r.latencyMs, inTok: r.inputTokens ?? 0, outTok: r.outputTokens ?? 0 });
      } catch (err) {
        rows.push({ group: c.group, prompt: c.prompt, reply: "", ok: false, fails: [`error: ${(err as Error).message.slice(0, 160)}`], ms: 0, inTok: 0, outTok: 0 });
      }
    }
  }
  await Promise.all([worker(), worker(), worker()]);
  return rows;
}

async function main() {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf("--out");
  const outFile = outIdx >= 0 ? args.splice(outIdx, 2)[1] : null;
  // --user email: run with the production tools against that account (read-only; proposals are never confirmed).
  const userIdx = args.indexOf("--user");
  const email = userIdx >= 0 ? args.splice(userIdx, 2)[1] : null;
  const models = args.length ? args : [AI_MODELS.main];
  let runTool: ToolRunner | undefined;
  if (email) {
    const { prisma } = await import("../src/lib/prisma");
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!user) throw new Error(`No user ${email}`);
    runTool = (name, a) => runAgentTool(user.id, name, a);
  }
  const system = buildSystemPrompt("Mr. Agent");
  const all: Record<string, Row[]> = {};

  for (const model of models) {
    const rows = await runModel(model, system, runTool);
    all[model] = rows;
    const pass = rows.filter((r) => r.ok).length;
    const inTok = rows.reduce((s, r) => s + r.inTok, 0);
    const outTok = rows.reduce((s, r) => s + r.outTok, 0);
    const [pin, pout] = PRICES[model] ?? [0, 0];
    const perMsg = (inTok * pin + outTok * pout) / 1e6 / rows.length;
    const lat = rows.filter((r) => r.ms).map((r) => r.ms).sort((a, b) => a - b);
    const groups = [...new Set(rows.map((r) => r.group))]
      .map((g) => `${g} ${rows.filter((r) => r.group === g && r.ok).length}/${rows.filter((r) => r.group === g).length}`)
      .join(" · ");
    console.log(`\n${model}\n  score ${pass}/${rows.length}  ·  ${groups}`);
    console.log(`  ≈ $${perMsg.toFixed(5)}/message  ·  median ${lat[Math.floor(lat.length / 2)] ?? 0} ms  ·  p90 ${lat[Math.floor(lat.length * 0.9)] ?? 0} ms  ·  avg ${Math.round(outTok / rows.length)} output tokens`);
    for (const r of rows.filter((x) => !x.ok)) console.log(`  FAIL [${r.group}] ${r.prompt} — ${r.fails.join("; ")}\n       ↳ ${r.reply.replace(/\n/g, " ⏎ ").slice(0, 220)}`);
  }
  if (outFile) writeFileSync(outFile, JSON.stringify(all, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
