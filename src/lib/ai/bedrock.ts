import {
  ApplyGuardrailCommand,
  BedrockRuntimeClient,
  ConverseCommand,
  type ApplyGuardrailCommandOutput,
  type Message,
} from "@aws-sdk/client-bedrock-runtime";
import { mantleChat, type MantleMessage, type MantleTool } from "./mantle";
import type { AgentProposal } from "./proposals";
import { looksLikeAdvice } from "./advice-check";
import { AI_GUARDRAIL, AI_LIMITS, AI_REGION } from "./config";

let client: BedrockRuntimeClient | null = null;
function getClient(): BedrockRuntimeClient {
  // One retry on throttling/5xx is handled by the SDK's standard retry mode.
  if (!client) client = new BedrockRuntimeClient({ region: AI_REGION, maxAttempts: 2 });
  return client;
}

export type ChatTurn = { role: "user" | "assistant"; text: string };

export type AgentReply = {
  text: string;
  /** An action the agent prepared for the user to review (tool-enabled chats only). */
  proposal?: AgentProposal;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
  guardrailHit: boolean;
};

/**
 * Bedrock's Converse API needs strictly alternating turns that start with
 * the user. Stored history can break that (e.g. a failed call left two user
 * messages in a row), so consecutive same-role turns are merged and any
 * leading assistant turns dropped.
 */
export function toConverseMessages(turns: ChatTurn[]): Message[] {
  const merged: ChatTurn[] = [];
  for (const t of turns) {
    const prev = merged[merged.length - 1];
    if (prev && prev.role === t.role) prev.text = `${prev.text}\n\n${t.text}`;
    else merged.push({ ...t });
  }
  while (merged.length && merged[0].role === "assistant") merged.shift();
  return merged.map((t) => ({ role: t.role, content: [{ text: t.text }] }));
}

/** Models on Bedrock's OpenAI-compatible endpoint are written as "mantle:<model id>". */
export const MANTLE_PREFIX = "mantle:";

type GuardrailCheck = { blocked: boolean; text: string };

/** True when a policy actually blocked (vs. only masking personal details). */
function wasBlocked(out: ApplyGuardrailCommandOutput): boolean {
  return (out.assessments ?? []).some(
    (a) =>
      a.topicPolicy?.topics?.some((t) => t.action === "BLOCKED") ||
      a.contentPolicy?.filters?.some((f) => f.action === "BLOCKED") ||
      a.wordPolicy?.customWords?.some((w) => w.action === "BLOCKED") ||
      a.sensitiveInformationPolicy?.piiEntities?.some((p) => p.action === "BLOCKED") ||
      a.sensitiveInformationPolicy?.regexes?.some((r) => r.action === "BLOCKED")
  );
}

/**
 * Runs the no-advice guardrail on one piece of text. Blocked → the caller
 * shows the refusal; masked (phone, PAN…) → the masked text is used instead.
 */
async function checkGuardrail(text: string, source: "INPUT" | "OUTPUT", signal: AbortSignal): Promise<GuardrailCheck> {
  if (!AI_GUARDRAIL || !text) return { blocked: false, text };
  const out = await getClient().send(
    new ApplyGuardrailCommand({
      guardrailIdentifier: AI_GUARDRAIL.id,
      guardrailVersion: AI_GUARDRAIL.version,
      source,
      content: [{ text: { text } }],
    }),
    { abortSignal: signal }
  );
  if (out.action !== "GUARDRAIL_INTERVENED") return { blocked: false, text };
  if (wasBlocked(out)) return { blocked: true, text };
  return { blocked: false, text: out.outputs?.[0]?.text ?? text };
}

export type ToolRunner = (name: string, args: string) => Promise<{ result: unknown; proposal?: AgentProposal }>;

/** Most tool rounds per message — enough to look something up, then prepare an action. */
const MAX_TOOL_ROUNDS = 4;

async function converseMantle({
  model,
  system,
  turns,
  tools,
  runTool,
}: {
  model: string;
  system: string;
  turns: ChatTurn[];
  tools?: MantleTool[];
  runTool?: ToolRunner;
}): Promise<AgentReply> {
  const started = Date.now();
  const signal = AbortSignal.timeout(AI_LIMITS.timeoutMs);
  const blocked = (): AgentReply => ({
    text: "",
    model,
    inputTokens: null,
    outputTokens: null,
    latencyMs: Date.now() - started,
    guardrailHit: true,
  });

  // Check the new message before it reaches the model — a blocked request costs nothing more.
  const merged = toConverseMessages(turns).map((m) => ({
    role: m.role as "user" | "assistant",
    content: (m.content ?? []).map((c) => ("text" in c ? c.text : "")).join(""),
  }));
  const lastIdx = merged.length - 1;
  const input = await checkGuardrail(merged[lastIdx]?.content ?? "", "INPUT", signal);
  if (input.blocked) return blocked();
  if (lastIdx >= 0) merged[lastIdx].content = input.text;

  const messages: MantleMessage[] = [{ role: "system", content: system }, ...merged];
  let inputTokens = 0;
  let outputTokens = 0;
  let proposal: AgentProposal | undefined;
  let text = "";

  for (let round = 0; ; round++) {
    const useTools = !!(tools?.length && runTool) && round < MAX_TOOL_ROUNDS;
    const res = await mantleChat({
      model: model.slice(MANTLE_PREFIX.length),
      messages,
      maxTokens: AI_LIMITS.maxOutputTokens,
      temperature: 0.3,
      tools: useTools ? tools : undefined,
      signal,
    });
    inputTokens += res.inputTokens ?? 0;
    outputTokens += res.outputTokens ?? 0;
    if (!useTools || res.toolCalls.length === 0) {
      text = res.text;
      break;
    }
    messages.push({ role: "assistant", content: res.text || null, tool_calls: res.toolCalls });
    for (const call of res.toolCalls) {
      let result: unknown;
      try {
        const out = await runTool!(call.function.name, call.function.arguments);
        result = out.result;
        if (out.proposal) proposal = out.proposal;
      } catch {
        result = { error: "That lookup failed. Tell the user briefly and continue without it." };
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result).slice(0, 12_000) });
    }
  }

  const output = await checkGuardrail(text, "OUTPUT", signal);
  if (output.blocked) return { ...blocked(), inputTokens, outputTokens };
  return {
    text: output.text,
    proposal,
    model,
    inputTokens,
    outputTokens,
    latencyMs: Date.now() - started,
    guardrailHit: false,
  };
}

export async function converse(args: {
  model: string;
  system: string;
  turns: ChatTurn[];
  tools?: MantleTool[];
  runTool?: ToolRunner;
}): Promise<AgentReply> {
  // Tools run on the OpenAI-compatible endpoint; the runtime path answers without them.
  const reply = await (args.model.startsWith(MANTLE_PREFIX) ? converseMantle(args) : converseRuntime(args));
  // Safety net on the reply itself: clear advice phrasing is replaced by the refusal.
  return !reply.guardrailHit && looksLikeAdvice(reply.text) ? { ...reply, text: "", guardrailHit: true } : reply;
}

async function converseRuntime({
  model,
  system,
  turns,
}: {
  model: string;
  system: string;
  turns: ChatTurn[];
}): Promise<AgentReply> {
  const started = Date.now();
  const res = await getClient().send(
    new ConverseCommand({
      modelId: model,
      system: [{ text: system }],
      messages: toConverseMessages(turns),
      inferenceConfig: { maxTokens: AI_LIMITS.maxOutputTokens, temperature: 0.3 },
      ...(AI_GUARDRAIL
        ? { guardrailConfig: { guardrailIdentifier: AI_GUARDRAIL.id, guardrailVersion: AI_GUARDRAIL.version } }
        : {}),
    }),
    { abortSignal: AbortSignal.timeout(AI_LIMITS.timeoutMs) }
  );

  const text = (res.output?.message?.content ?? [])
    .map((block) => ("text" in block && block.text ? block.text : ""))
    .join("")
    .trim();

  return {
    text,
    model,
    inputTokens: res.usage?.inputTokens ?? null,
    outputTokens: res.usage?.outputTokens ?? null,
    latencyMs: Date.now() - started,
    guardrailHit: res.stopReason === "guardrail_intervened",
  };
}
