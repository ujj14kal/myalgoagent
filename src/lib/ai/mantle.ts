import { createHash, createHmac } from "node:crypto";
import { SignatureV4 } from "@smithy/signature-v4";
import { defaultProvider } from "@aws-sdk/credential-provider-node";
import { AI_REGION } from "./config";

// Bedrock's OpenAI-compatible endpoint ("bedrock-mantle"). Requests are signed
// with the same AWS credentials as every other AWS call (the SSR compute role
// in production, a local profile in dev) — no API key or extra secret.

const HOST = `bedrock-mantle.${AI_REGION}.api.aws`;

type SourceData = string | ArrayBuffer | ArrayBufferView;
const toBytes = (d: SourceData): string | Uint8Array =>
  typeof d === "string" ? d : ArrayBuffer.isView(d) ? new Uint8Array(d.buffer, d.byteOffset, d.byteLength) : new Uint8Array(d);

/** SHA-256 / HMAC for the SigV4 signer, on Node's built-in crypto. */
export class Sha256 {
  private h;
  constructor(secret?: SourceData) {
    this.h = secret ? createHmac("sha256", toBytes(secret)) : createHash("sha256");
  }
  update(data: SourceData) {
    this.h.update(toBytes(data));
  }
  async digest() {
    return new Uint8Array(this.h.digest());
  }
}

let signer: SignatureV4 | null = null;
function getSigner(): SignatureV4 {
  if (!signer) {
    signer = new SignatureV4({ service: "bedrock-mantle", region: AI_REGION, sha256: Sha256, credentials: defaultProvider() });
  }
  return signer;
}

export type MantleToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };

export type MantleMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: MantleToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type MantleTool = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

export type MantleResult = {
  text: string;
  toolCalls: MantleToolCall[];
  inputTokens: number | null;
  outputTokens: number | null;
};

/** One chat completion. Retries once on throttling or a 5xx. */
export async function mantleChat({
  model,
  messages,
  maxTokens,
  temperature,
  tools,
  signal,
}: {
  model: string;
  messages: MantleMessage[];
  maxTokens: number;
  temperature: number;
  tools?: MantleTool[];
  signal?: AbortSignal;
}): Promise<MantleResult> {
  const path = "/v1/chat/completions";
  const body = JSON.stringify({
    model,
    messages,
    max_tokens: maxTokens,
    temperature,
    ...(tools?.length ? { tools, tool_choice: "auto" } : {}),
  });

  for (let attempt = 0; ; attempt++) {
    const signed = await getSigner().sign({
      method: "POST",
      protocol: "https:",
      hostname: HOST,
      path,
      headers: { host: HOST, "content-type": "application/json" },
      body,
    });
    const res = await fetch(`https://${HOST}${path}`, { method: "POST", headers: signed.headers, body, signal });
    if (res.ok) {
      const data = (await res.json()) as {
        choices?: { message?: { content?: string | null; tool_calls?: MantleToolCall[] } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      return {
        text: (data.choices?.[0]?.message?.content ?? "").trim(),
        toolCalls: data.choices?.[0]?.message?.tool_calls ?? [],
        inputTokens: data.usage?.prompt_tokens ?? null,
        outputTokens: data.usage?.completion_tokens ?? null,
      };
    }
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= 1) {
      throw new Error(`bedrock-mantle ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
    await new Promise((r) => setTimeout(r, 600));
  }
}
