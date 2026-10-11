"use server";

import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { logError } from "@/lib/logger";
import { converse } from "@/lib/ai/bedrock";
import { AI_MODELS } from "@/lib/ai/config";
import { writeRule, type RuleCodePart } from "@/lib/ai/rule-code";

// The code editor's "write it with the assistant": returns data, never throws (a thrown message is hidden in production).

export type RuleCodeResult = { ok: true; code: string; retried: boolean } | { ok: false; error: string };

export async function writeRuleCodeAction(input: { description: string; part: RuleCodePart; current?: string; problem?: string }): Promise<RuleCodeResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "Sign in again." };
  const description = (input.description ?? "").trim().slice(0, 600);
  const current = (input.current ?? "").slice(0, 1500);
  if (!description && !(input.problem && current)) return { ok: false, error: "Say in a few words what the rule should do." };
  if (input.part !== "entry" && input.part !== "exit") return { ok: false, error: "Something went wrong — reload the page." };
  if (await checkRateLimit(`rule-code:${userId}`, 20, 60 * 60_000)) return { ok: false, error: "That's a lot of rules in an hour — wait a little, or write this one by hand." };
  const ask = async (system: string, user: string) => {
    const run = (model: string) => converse({ model, system, turns: [{ role: "user", text: user }] });
    let reply;
    try {
      reply = await run(AI_MODELS.main);
    } catch (err) {
      logError("rule-code:main", err, { userId });
      reply = await run(AI_MODELS.fallback);
    }
    return reply.text;
  };
  try {
    return await writeRule(ask, { description, part: input.part, current, problem: input.problem });
  } catch (err) {
    logError("rule-code", err, { userId });
    return { ok: false, error: "The assistant couldn't answer just now. Try again in a moment, or write the rule by hand." };
  }
}
