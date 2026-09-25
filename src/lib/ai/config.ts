// Model routing for the user's agent (the AI assistant). All models run on
// AWS Bedrock from ap-south-1. Nova 2 Lite is only served through Bedrock's
// "global" cross-region profile, so a prompt may be processed outside India —
// the privacy policy says so, and prompts never carry personal details (no
// name, email or phone — only the user's question and platform facts).
// Conversations themselves are stored in RDS in Mumbai.

export const AI_REGION = "ap-south-1";

export const AI_MODELS = {
  /**
   * OpenAI gpt-oss-120b on Bedrock's OpenAI-compatible endpoint (served from
   * ap-south-1). Chosen 2026-09-24 over gpt-oss-20b, GLM 4.7, Kimi K2.5,
   * DeepSeek V3.2, Qwen3 235B and Mistral Large 3 on the 35-case eval
   * (scripts/agent-eval.ts): top score, best strategy cards, fastest,
   * ~$0.0006/message. The Bedrock runtime models (Nova, Claude) are still
   * held at a zero quota on this account; switching back is this one line.
   */
  main: "mantle:openai.gpt-oss-120b",
  /** Answers if the main model errors or is throttled — same eval score, cheaper. */
  fallback: "mantle:openai.gpt-oss-20b",
} as const;

/**
 * Bedrock Guardrail that blocks personalised buy/sell advice and return
 * predictions, and masks personal details (incl. PAN/Aadhaar patterns).
 * `myalgoagent-no-advice`, created in ap-south-1 on 2026-09-24. Set to
 * null to run without it (local experiments only — production must have it).
 */
export const AI_GUARDRAIL: { id: string; version: string } | null = { id: "p717f2wfyw7e", version: "6" };

export const AI_LIMITS = {
  /** Longest message a user can send. */
  maxUserChars: 2000,
  /** Cap on each reply, in tokens — keeps cost and latency bounded. */
  maxOutputTokens: 900,
  /** Tool rounds write whole strategies as JSON (plus the model's reasoning) — they need more room. */
  maxToolTokens: 3000,
  /** How many earlier messages of the conversation are sent as context. */
  historyMessages: 12,
  perMinute: 20,
  perDay: 200,
  /** Bedrock call timeout — must finish well inside the SSR request limit. */
  timeoutMs: 25_000,
} as const;

/** Shown when the guardrail or the advice safety net stops a reply (same text as the guardrail's own block message). */
export const AI_BLOCKED_REPLY =
  "I'm not able to help with that. I don't recommend what to buy, sell or hold, select stocks, or predict prices or returns. I can, however, help you turn your idea into clear rules and backtest it, so you can see how it would have performed on historical data.";
