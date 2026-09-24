import {
  ApplyGuardrailCommand,
  BedrockRuntimeClient,
  ConverseCommand,
  type ApplyGuardrailCommandOutput,
  type Message,
} from "@aws-sdk/client-bedrock-runtime";
import { mantleChat } from "./mantle";
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

async function converseMantle({
  model,
  system,
  turns,
}: {
  model: string;
  system: string;
  turns: ChatTurn[];
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

  const res = await mantleChat({
    model: model.slice(MANTLE_PREFIX.length),
    messages: [{ role: "system", content: system }, ...merged],
    maxTokens: AI_LIMITS.maxOutputTokens,
    temperature: 0.3,
    signal,
  });

  const output = await checkGuardrail(res.text, "OUTPUT", signal);
  if (output.blocked) return { ...blocked(), inputTokens: res.inputTokens, outputTokens: res.outputTokens };
  return {
    text: output.text,
    model,
    inputTokens: res.inputTokens,
    outputTokens: res.outputTokens,
    latencyMs: Date.now() - started,
    guardrailHit: false,
  };
}

export async function converse(args: { model: string; system: string; turns: ChatTurn[] }): Promise<AgentReply> {
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
