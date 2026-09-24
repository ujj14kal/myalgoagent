"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { logError } from "@/lib/logger";
import { DEFAULT_AGENT_NAME } from "@/lib/agent-constants";
import { AI_BLOCKED_REPLY as BLOCKED_REPLY, AI_LIMITS, AI_MODELS } from "@/lib/ai/config";
import { buildSystemPrompt } from "@/lib/ai/system-prompt";
import { converse } from "@/lib/ai/bedrock";

export type AgentChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  guardrailHit: boolean;
  rating: 1 | -1 | null;
  createdAt: string;
};

export type AgentConversationSummary = { id: string; title: string; updatedAt: string };

type Fail = { ok: false; error: string };



function toMessage(m: {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  guardrailHit: boolean;
  rating: number | null;
  createdAt: Date;
}): AgentChatMessage {
  return {
    id: m.id,
    role: m.role === "USER" ? "user" : "assistant",
    content: m.content,
    guardrailHit: m.guardrailHit,
    rating: m.rating === 1 || m.rating === -1 ? m.rating : null,
    createdAt: m.createdAt.toISOString(),
  };
}

/** The user's recent conversations, newest first. */
export async function listAgentConversations(): Promise<{ ok: true; conversations: AgentConversationSummary[] } | Fail> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not signed in." };
  try {
    const rows = await prisma.agentConversation.findMany({
      where: { userId: session.user.id },
      orderBy: { updatedAt: "desc" },
      take: 20,
      select: { id: true, title: true, updatedAt: true },
    });
    return {
      ok: true,
      conversations: rows.map((r) => ({ id: r.id, title: r.title, updatedAt: r.updatedAt.toISOString() })),
    };
  } catch (err) {
    logError("agent-chat:list", err, { userId: session.user.id });
    return { ok: false, error: "We couldn't load your conversations. Please try again." };
  }
}

/** Messages of one conversation — or of the most recent one when no id is given. */
export async function getAgentConversation(
  conversationId?: string
): Promise<{ ok: true; conversationId: string | null; messages: AgentChatMessage[] } | Fail> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not signed in." };
  try {
    const convo = await prisma.agentConversation.findFirst({
      where: { userId: session.user.id, ...(conversationId ? { id: conversationId } : {}) },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        messages: { orderBy: { createdAt: "asc" }, take: 200 },
      },
    });
    if (!convo) return { ok: true, conversationId: null, messages: [] };
    return { ok: true, conversationId: convo.id, messages: convo.messages.map(toMessage) };
  } catch (err) {
    logError("agent-chat:get", err, { userId: session.user.id });
    return { ok: false, error: "We couldn't load this conversation. Please try again." };
  }
}

export async function sendAgentMessage(input: {
  conversationId: string | null;
  text: string;
}): Promise<{ ok: true; conversationId: string; userMessage: AgentChatMessage; reply: AgentChatMessage } | Fail> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not signed in." };
  const userId = session.user.id;

  const text = typeof input?.text === "string" ? input.text.trim() : "";
  if (!text) return { ok: false, error: "Please enter a message." };
  if (text.length > AI_LIMITS.maxUserChars) {
    return { ok: false, error: `Your message is too long. Please keep it under ${AI_LIMITS.maxUserChars.toLocaleString("en-IN")} characters.` };
  }

  const perMinute = await checkRateLimit(`agent-chat:${userId}`, AI_LIMITS.perMinute, 60_000);
  if (perMinute) return { ok: false, error: perMinute };
  const perDay = await checkRateLimit(`agent-chat-day:${userId}`, AI_LIMITS.perDay, 24 * 60 * 60_000);
  if (perDay) return { ok: false, error: "You have reached today's message limit. It resets within 24 hours." };

  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { agentName: true } });
    const agentName = user?.agentName ?? DEFAULT_AGENT_NAME;

    // Ownership check: a conversation id from the client is only used if it's this user's.
    let conversationId: string | null = null;
    let createdNow = false;
    if (input.conversationId) {
      const owned = await prisma.agentConversation.findFirst({
        where: { id: input.conversationId, userId },
        select: { id: true },
      });
      conversationId = owned?.id ?? null;
    }
    if (!conversationId) {
      const created = await prisma.agentConversation.create({
        data: { userId, title: text.replace(/\s+/g, " ").slice(0, 60) },
        select: { id: true },
      });
      conversationId = created.id;
      createdNow = true;
    }

    const history = await prisma.agentMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: "desc" },
      take: AI_LIMITS.historyMessages,
      select: { role: true, content: true },
    });

    const userMessage = await prisma.agentMessage.create({
      data: { conversationId, role: "USER", content: text },
    });

    const request = {
      system: buildSystemPrompt(agentName),
      turns: [
        ...history.reverse().map((m) => ({ role: m.role === "USER" ? ("user" as const) : ("assistant" as const), text: m.content })),
        { role: "user" as const, text },
      ],
    };
    let reply;
    try {
      try {
        reply = await converse({ model: AI_MODELS.main, ...request });
      } catch (err) {
        logError("agent-chat:bedrock-main", err, { userId, conversationId, model: AI_MODELS.main });
        reply = await converse({ model: AI_MODELS.fallback, ...request });
      }
    } catch (err) {
      logError("agent-chat:bedrock", err, { userId, conversationId });
      // Don't leave an unanswered message behind — the user retries from the composer.
      await (createdNow
        ? prisma.agentConversation.delete({ where: { id: conversationId } })
        : prisma.agentMessage.delete({ where: { id: userMessage.id } })
      ).catch((cleanupErr) => logError("agent-chat:cleanup", cleanupErr, { userId, conversationId }));
      return { ok: false, error: `${agentName} is unavailable at the moment. Please try again shortly.` };
    }

    const content = reply.guardrailHit || !reply.text ? BLOCKED_REPLY : reply.text;
    const saved = await prisma.agentMessage.create({
      data: {
        conversationId,
        role: "ASSISTANT",
        content,
        model: reply.model,
        inputTokens: reply.inputTokens,
        outputTokens: reply.outputTokens,
        latencyMs: reply.latencyMs,
        guardrailHit: reply.guardrailHit,
      },
    });
    await prisma.agentConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });

    return { ok: true, conversationId, userMessage: toMessage(userMessage), reply: toMessage(saved) };
  } catch (err) {
    logError("agent-chat:send", err, { userId });
    return { ok: false, error: "Something went wrong. Please refresh the page and try again." };
  }
}

/** 👍 / 👎 on one of the agent's replies (0 clears it). Only the reply's owner can rate it. */
export async function rateAgentMessage(input: { messageId: string; rating: 1 | -1 | 0 }): Promise<{ ok: true } | Fail> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not signed in." };
  const rating = input?.rating;
  if (rating !== 1 && rating !== -1 && rating !== 0) return { ok: false, error: "Invalid rating." };

  const limited = await checkRateLimit(`agent-rate:${session.user.id}`, 60, 60_000);
  if (limited) return { ok: false, error: limited };

  try {
    const res = await prisma.agentMessage.updateMany({
      where: { id: input.messageId, role: "ASSISTANT", conversation: { userId: session.user.id } },
      data: { rating: rating === 0 ? null : rating },
    });
    if (res.count === 0) return { ok: false, error: "We couldn't find that reply." };
    return { ok: true };
  } catch (err) {
    logError("agent-chat:rate", err, { userId: session.user.id });
    return { ok: false, error: "We couldn't save your rating. Please try again." };
  }
}
