import { BedrockRuntimeClient, ConverseCommand, type Message } from "@aws-sdk/client-bedrock-runtime";
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

export async function converse({
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
