// Model routing for the user's agent (the AI assistant). All models run on
// AWS Bedrock from ap-south-1. Nova 2 Lite is only served through Bedrock's
// "global" cross-region profile, so a prompt may be processed outside India —
// the privacy policy says so, and prompts never carry personal details (no
// name, email or phone — only the user's question and platform facts).
// Conversations themselves are stored in RDS in Mumbai.

export const AI_REGION = "ap-south-1";

export const AI_MODELS = {
  /** Strategy help and anything that needs real reasoning. */
  main: "global.amazon.nova-2-lite-v1:0",
} as const;

/**
 * Bedrock Guardrail that blocks personalised buy/sell advice and return
 * predictions, and masks personal details (incl. PAN/Aadhaar patterns).
 * `myalgoagent-no-advice`, created in ap-south-1 on 2026-09-24. Set to
 * null to run without it (local experiments only — production must have it).
 */
export const AI_GUARDRAIL: { id: string; version: string } | null = { id: "p717f2wfyw7e", version: "1" };

export const AI_LIMITS = {
  /** Longest message a user can send. */
  maxUserChars: 2000,
  /** Cap on each reply, in tokens — keeps cost and latency bounded. */
  maxOutputTokens: 900,
  /** How many earlier messages of the conversation are sent as context. */
  historyMessages: 12,
  perMinute: 20,
  perDay: 200,
  /** Bedrock call timeout — must finish well inside the SSR request limit. */
  timeoutMs: 25_000,
} as const;
