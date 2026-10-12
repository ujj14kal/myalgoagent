"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, X } from "lucide-react";
import BodyPortal from "@/components/ui/body-portal";
import Agent2D from "@/components/robot/agent-2d";
import { sendAgentMessage } from "@/lib/agent-chat-actions";
import { DESCRIBE_BLOCK_PREFIX, DESCRIBE_CONCEPT_PREFIX, DESCRIBE_PREFIX, TALK_STRATEGY_PREFIX } from "@/lib/ai/describe-indicator";
import type { AgentProposal, ProposalStatus } from "@/lib/ai/proposals";
import { splitChoices } from "@/lib/ai/choices";
import { ACTION_COST } from "@/lib/credits/config";
import { ProposalCard, ProposalReviewModal } from "./proposal-review";
import { creditsChanged, useCredits } from "@/components/credits/credits-provider";

export type BuildKind = "indicator" | "block" | "concept" | "strategy";

const KINDS: Record<BuildKind, { prefix: string; title: string; hint: string; placeholder: string; ideas: string[] }> = {
  indicator: {
    prefix: DESCRIBE_PREFIX,
    title: "Build an indicator",
    hint: "Tell me what you want to measure or mark. I'll explain it, ask how you define it, then show you a demo before anything is saved.",
    placeholder: "e.g. how far price is from its 50-day average, in ATRs",
    ideas: ["How far price is from its 50-day average, in ATRs", "Today's volume against its 20-day average", "A channel from the 20-day high to the 20-day low"],
  },
  block: {
    prefix: DESCRIBE_BLOCK_PREFIX,
    title: "Build a block",
    hint: "Name the market component. I'll explain it, ask how you define it, then show a demo on a made-up stock before the block is created.",
    placeholder: "e.g. accumulation, a liquidity sweep, a fair value gap",
    ideas: ["Accumulation", "A liquidity sweep of the previous day's low", "A fair value gap that price returns into"],
  },
  concept: {
    prefix: DESCRIBE_CONCEPT_PREFIX,
    title: "Build a concept",
    hint: "Describe the setup you trade. I'll ask whether it is bullish or bearish and whether the blocks happen in sequence or all at one time, then show the whole thing in a demo.",
    placeholder: "e.g. a sweep, then a break of structure, then a fair value gap retest",
    ideas: ["Liquidity sweep, then break of structure, then a fair value gap retest", "Accumulation followed by a volume breakout", "Price above the 50 EMA with a bullish engulfing candle at support"],
  },
  strategy: {
    prefix: TALK_STRATEGY_PREFIX,
    title: "Talk to your agent",
    hint: "Tell me the strategy in your own words. I'll ask one short question if something essential is missing, then prepare it for you to review.",
    placeholder: "e.g. buy Tata Steel when RSI crosses above 30, exit at 60",
    ideas: ["Buy when the 20 EMA crosses above the 50 EMA, exit when it crosses back", "Buy the first 15-minute breakout, stop at the low", "Swing: buy pullbacks to the 50 SMA in an uptrend"],
  },
};

type Turn = { id: string; role: "user" | "assistant"; text: string; proposal: AgentProposal | null };

function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split(/\n{2,}/).map((para, i) => (
        <p key={i} className={i ? "mt-2" : ""}>
          {para.split(/(\*\*[^*]+\*\*)/g).map((seg, j) => (seg.startsWith("**") && seg.endsWith("**") ? <strong key={j} className="font-semibold text-brand-navy">{seg.slice(2, -2)}</strong> : seg))}
        </p>
      ))}
    </>
  );
}

/**
 * A focused window for building one thing with the assistant, right where the user is — no trip to the chat page. It keeps its own
 * short conversation, offers the assistant's suggested answers as buttons, and shows the review (with a demo) in place.
 */
export default function BuildWindow({ kind, seed, agentName, onClose }: { kind: BuildKind; seed: string | null; agentName: string; onClose: () => void }) {
  const cfg = KINDS[kind];
  const { apply } = useCredits();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [reviewing, setReviewing] = useState<{ messageId: string; proposal: AgentProposal } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  const send = (raw: string) => {
    const clean = raw.trim();
    if (!clean || pending) return;
    setError(null);
    setText("");
    const mine: Turn = { id: `u-${turns.length}`, role: "user", text: clean, proposal: null };
    setTurns((t) => [...t, mine]);
    start(async () => {
      const r = await sendAgentMessage({ conversationId, text: `${cfg.prefix}${clean}` });
      if (!r.ok) return (setError(r.error), creditsChanged());
      apply(r.credits);
      setConversationId(r.conversationId);
      setTurns((t) => [...t, { id: r.reply.id, role: "assistant", text: r.reply.content, proposal: r.reply.proposal }]);
      if (r.reply.proposal && r.reply.proposal.status === "pending") setReviewing({ messageId: r.reply.id, proposal: r.reply.proposal });
    });
  };

  // Opened from a "describe it" box: its text is the first message.
  useEffect(() => {
    if (seed && !started.current) {
      started.current = true;
      send(seed);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, pending]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !reviewing && !pending && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, pending, reviewing]);

  const markProposal = (messageId: string, status: ProposalStatus) => setTurns((all) => all.map((t) => (t.id === messageId && t.proposal ? { ...t, proposal: { ...t.proposal, status } as AgentProposal } : t)));
  const last = turns[turns.length - 1];
  const lastChoices = last?.role === "assistant" && !pending ? splitChoices(last.text).choices : [];

  return (
    <BodyPortal>
      <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={`${cfg.title} with ${agentName}`}>
        <button type="button" aria-label="Close" className="absolute inset-0 bg-[#0e1b2d]/55 backdrop-blur-[3px]" onClick={() => !pending && !reviewing && onClose()} />
        <motion.div
          initial={{ opacity: 0, y: 28, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 360, damping: 32 }}
          className="relative flex h-[min(86vh,720px)] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-[0_40px_80px_-24px_rgba(14,27,45,0.6)] sm:max-w-xl sm:rounded-3xl"
        >
          <div className="app-sidebar-bg relative flex items-center gap-3 overflow-hidden px-5 py-3.5 text-white">
            <span className="relative -my-3 shrink-0">
              <Agent2D pose={pending ? "working" : "talk"} size={60} trackCursor={false} />
            </span>
            <div className="relative min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-gold">With {agentName}</p>
              <p className="truncate text-lg font-bold">{cfg.title}</p>
            </div>
            <button type="button" onClick={onClose} disabled={pending} aria-label="Close" className="relative flex h-8 w-8 items-center justify-center rounded-lg text-white/65 hover:bg-white/10 hover:text-white disabled:opacity-40">
              <X size={18} />
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
            {turns.length === 0 && (
              <div>
                <p className="text-sm text-brand-navy/70">{cfg.hint}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {cfg.ideas.map((i) => (
                    <button key={i} type="button" onClick={() => send(i)} className="rounded-full border border-dashed border-brand-navy/20 px-3 py-1 text-xs text-brand-navy/65 hover:border-brand-primary">
                      {i}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {turns.map((t) => {
              const parts = t.role === "assistant" ? splitChoices(t.text) : { body: t.text, choices: [] };
              return (
                <div key={t.id} className={t.role === "user" ? "flex justify-end" : "flex"}>
                  <div className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${t.role === "user" ? "bg-brand-primary text-white" : "bg-brand-bg text-brand-navy/80 ring-1 ring-black/5"}`}>
                    {parts.body ? <Rich text={parts.body} /> : t.proposal ? null : <span className="text-brand-navy/50">…</span>}
                    {t.proposal && (
                      <div className={parts.body ? "mt-2.5" : ""}>
                        <ProposalCard proposal={t.proposal} onReview={() => setReviewing({ messageId: t.id, proposal: t.proposal! })} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {pending && (
              <div className="flex">
                <div className="rounded-2xl bg-brand-bg px-3.5 py-2.5 text-sm text-brand-navy/50 ring-1 ring-black/5">
                  <span className="inline-flex items-center gap-2">
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-brand-primary/30 border-t-brand-primary" /> {agentName} is thinking…
                  </span>
                </div>
              </div>
            )}
            {error && <p role="alert" className="rounded-lg bg-brand-sell/[0.07] px-3 py-2 text-sm font-medium text-brand-sell">{error}</p>}
            <div ref={endRef} />
          </div>

          {lastChoices.length > 0 && (
            <div className="flex flex-wrap gap-1.5 border-t border-black/5 px-5 py-2.5">
              {lastChoices.map((c) => (
                <button key={c} type="button" onClick={() => send(c)} className="rounded-xl border border-brand-primary/30 bg-brand-primary/[0.04] px-3 py-1.5 text-left text-xs font-medium text-brand-primary hover:bg-brand-primary/10">
                  {c}
                </button>
              ))}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(text);
            }}
            className="flex items-center gap-2 border-t border-black/5 bg-brand-bg/60 px-4 py-3"
          >
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={1500}
              placeholder={turns.length ? "Pick a suggestion above, or type your own answer…" : cfg.placeholder}
              aria-label="Your message"
              className="min-w-0 flex-1 rounded-xl border border-brand-navy/15 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-brand-primary"
            />
            <button type="submit" disabled={pending || !text.trim()} aria-label="Send" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-primary text-white disabled:opacity-40">
              <ArrowUp size={18} />
            </button>
          </form>
          <p className="px-5 pb-3 pt-1 text-center text-[11px] text-brand-navy/40">Nothing is created until you have seen the demo and confirmed. Replies take {ACTION_COST.ai_reply} credits, or {ACTION_COST.ai_build} when something is prepared.</p>
        </motion.div>
      </div>

      <AnimatePresence>
        {reviewing && (
          <ProposalReviewModal
            key={reviewing.messageId}
            messageId={reviewing.messageId}
            proposal={reviewing.proposal}
            agentName={agentName}
            onClose={() => setReviewing(null)}
            onDecided={(status) => markProposal(reviewing.messageId, status)}
            onDone={() => {
              setReviewing(null);
              onClose();
            }}
          />
        )}
      </AnimatePresence>
    </BodyPortal>
  );
}
