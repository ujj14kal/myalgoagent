"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, ArrowUp, Check, ClipboardList, Copy, History, Plus, X } from "lucide-react";
import BodyPortal from "@/components/ui/body-portal";
import AgentAvatar from "@/components/ui/agent-avatar";
import type { AgentPose } from "@/components/robot/agent-2d";
import {
  getAgentConversation,
  listAgentConversations,
  sendAgentMessage,
  type AgentChatMessage,
  type AgentConversationSummary,
} from "@/lib/agent-chat-actions";
import { parseReplyBlocks, parseReplyLinks } from "@/lib/ai/links";

const STARTERS = [
  "How do I build my first strategy?",
  "Explain RSI in simple terms",
  "What does max drawdown mean?",
  "How is paper trading different from a backtest?",
];

const MAX_CHARS = 2000;

/** Renders one line of a reply: **bold** and allow-listed in-app links. */
function Inline({ text, onNavigate }: { text: string; onNavigate: () => void }) {
  return (
    <>
      {parseReplyLinks(text).map((part, i) =>
        part.kind === "link" ? (
          <Link key={i} href={part.href} onClick={onNavigate} className="font-semibold text-brand-primary underline decoration-brand-primary/30 underline-offset-2 hover:decoration-brand-primary">
            {part.text}
          </Link>
        ) : (
          part.text.split(/(\*\*[^*]+\*\*)/g).map((seg, j) =>
            seg.startsWith("**") && seg.endsWith("**") ? (
              <strong key={`${i}-${j}`} className="font-semibold text-brand-navy">
                {seg.slice(2, -2)}
              </strong>
            ) : (
              <span key={`${i}-${j}`}>{seg}</span>
            )
          )
        )
      )}
    </>
  );
}

/** A reply as paragraphs and bullet lists — no raw HTML is ever rendered. */
function ReplyBody({ content, onNavigate }: { content: string; onNavigate: () => void }) {
  const blocks = content.split(/\n{2,}/);
  return (
    <div className="space-y-2">
      {blocks.map((block, bi) => {
        const lines = block.split("\n").filter((l) => l.trim());
        const isList = lines.length > 0 && lines.every((l) => /^\s*([-*•]|\d+[.)])\s+/.test(l));
        if (isList) {
          const ordered = /^\s*\d/.test(lines[0]);
          const Tag = ordered ? "ol" : "ul";
          return (
            <Tag key={bi} className={`space-y-1 pl-5 ${ordered ? "list-decimal" : "list-disc"} marker:text-brand-primary/50`}>
              {lines.map((l, li) => (
                <li key={li}>
                  <Inline text={l.replace(/^\s*([-*•]|\d+[.)])\s+/, "")} onNavigate={onNavigate} />
                </li>
              ))}
            </Tag>
          );
        }
        return (
          <p key={bi}>
            {lines.map((l, li) => (
              <span key={li}>
                {li > 0 && <br />}
                <Inline text={l} onNavigate={onNavigate} />
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

/** A drafted strategy the user reviews before building it themselves. */
function StrategyDraftCard({ fields, onNavigate }: { fields: { label: string; value: string }[]; onNavigate: () => void }) {
  const [copied, setCopied] = useState(false);
  const text = fields.map((f) => (f.label ? `${f.label}: ${f.value}` : f.value)).join("\n");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — the rules stay visible to copy by hand */
    }
  };
  return (
    <div className="overflow-hidden rounded-xl bg-brand-bg ring-1 ring-brand-primary/15">
      <div className="flex items-center gap-2 border-b border-brand-primary/10 bg-brand-primary/[0.05] px-3 py-2">
        <ClipboardList size={14} className="text-brand-primary" />
        <span className="text-xs font-bold uppercase tracking-wider text-brand-primary">Strategy draft</span>
        <span className="ml-auto text-[10.5px] text-brand-navy/45">Review before building</span>
      </div>
      <dl className="divide-y divide-black/5 px-3">
        {fields.map((f, i) => (
          <div key={i} className="grid grid-cols-[92px_1fr] gap-2 py-1.5 text-[13px]">
            <dt className="text-brand-navy/50">{f.label}</dt>
            <dd className="font-medium text-brand-navy">{f.value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex gap-2 border-t border-black/5 p-2">
        <Link href="/app/strategies/new" onClick={onNavigate} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand-primary px-3 py-2 text-xs font-semibold text-white hover:bg-brand-primary-light">
          Open the builder <ArrowRight size={13} />
        </Link>
        <button type="button" onClick={copy} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-brand-navy/70 ring-1 ring-black/10 hover:text-brand-primary">
          {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy rules"}
        </button>
      </div>
    </div>
  );
}

/** An assistant reply: prose, strategy drafts and next-step buttons. */
function AssistantReply({ content, onNavigate }: { content: string; onNavigate: () => void }) {
  const blocks = parseReplyBlocks(content);
  const actions = blocks.filter((b) => b.kind === "action").slice(0, 2);
  return (
    <div className="space-y-3">
      {blocks.map((b, i) =>
        b.kind === "text" ? (
          <ReplyBody key={i} content={b.text} onNavigate={onNavigate} />
        ) : b.kind === "strategy" ? (
          <StrategyDraftCard key={i} fields={b.fields} onNavigate={onNavigate} />
        ) : null
      )}
      {actions.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-0.5">
          {actions.map((a) =>
            a.kind === "action" ? (
              <Link key={a.href + a.label} href={a.href} onClick={onNavigate} className="inline-flex items-center gap-1.5 rounded-full bg-brand-primary/[0.08] px-3 py-1.5 text-xs font-semibold text-brand-primary ring-1 ring-brand-primary/15 hover:bg-brand-primary hover:text-white">
                {a.label} <ArrowRight size={12} />
              </Link>
            ) : null
          )}
        </div>
      )}
    </div>
  );
}

export default function AgentChatPanel({
  open,
  onClose,
  agentName,
}: {
  open: boolean;
  onClose: () => void;
  agentName: string;
}) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AgentChatMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"chat" | "history">("chat");
  const [history, setHistory] = useState<AgentConversationSummary[]>([]);
  const [justReplied, setJustReplied] = useState(false);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const pendingSeq = useRef(0);

  // Load the most recent conversation the first time the panel opens.
  useEffect(() => {
    if (!open || loaded) return;
    let cancelled = false;
    getAgentConversation().then((res) => {
      if (cancelled) return;
      if (res.ok) {
        setConversationId(res.conversationId);
        setMessages(res.messages);
      }
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [open, loaded]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 250);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, isPending, view]);

  useEffect(() => {
    if (!justReplied) return;
    const t = setTimeout(() => setJustReplied(false), 2600);
    return () => clearTimeout(t);
  }, [justReplied]);

  const last = messages[messages.length - 1];
  const pose: AgentPose = isPending
    ? "thinking"
    : error
    ? "sad"
    : last?.role === "assistant" && last.guardrailHit
    ? "alert"
    : justReplied
    ? "talk"
    : messages.length === 0
    ? "wave"
    : "idle";

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isPending) return;
    setError(null);
    setDraft("");
    const optimistic: AgentChatMessage = {
      id: `pending-${++pendingSeq.current}`,
      role: "user",
      content: trimmed,
      guardrailHit: false,
      createdAt: "",
    };
    setMessages((m) => [...m, optimistic]);
    startTransition(async () => {
      try {
        const res = await sendAgentMessage({ conversationId, text: trimmed });
        if (!res.ok) {
          setMessages((m) => m.filter((x) => x.id !== optimistic.id));
          setDraft(trimmed);
          setError(res.error);
          return;
        }
        setConversationId(res.conversationId);
        setMessages((m) => [...m.filter((x) => x.id !== optimistic.id), res.userMessage, res.reply]);
        setJustReplied(true);
      } catch {
        setMessages((m) => m.filter((x) => x.id !== optimistic.id));
        setDraft(trimmed);
        setError("Couldn't reach the server — please refresh the page and try again.");
      }
    });
  };

  const newChat = () => {
    setConversationId(null);
    setMessages([]);
    setError(null);
    setView("chat");
    inputRef.current?.focus();
  };

  const showHistory = () => {
    setView("history");
    listAgentConversations().then((res) => res.ok && setHistory(res.conversations));
  };

  const openConversation = (id: string) => {
    setView("chat");
    setError(null);
    getAgentConversation(id).then((res) => {
      if (!res.ok) return setError(res.error);
      setConversationId(res.conversationId);
      setMessages(res.messages);
    });
  };

  return (
    <BodyPortal>
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label={`Chat with ${agentName}`}>
            <motion.button
              type="button"
              aria-label="Close chat"
              className="absolute inset-0 bg-[#0e1b2d]/40 backdrop-blur-[2px]"
              onClick={onClose}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <motion.aside
              className="absolute inset-y-0 right-0 flex w-full flex-col bg-brand-bg shadow-2xl sm:w-[420px] sm:rounded-l-3xl"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 40 }}
            >
              {/* header */}
              <div className="app-sidebar-bg flex shrink-0 items-center gap-3 px-4 py-3.5 text-white sm:rounded-tl-3xl">
                <AgentAvatar pose={pose} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-bold">{agentName}</p>
                  <p className="flex items-center gap-1.5 text-[11px] text-white/60">
                    <span className={`h-1.5 w-1.5 rounded-full ${isPending ? "animate-pulse bg-brand-gold" : "bg-brand-buy"}`} />
                    {isPending ? "Thinking…" : "Explains and guides — never gives trade advice"}
                  </p>
                </div>
                <button type="button" onClick={view === "history" ? () => setView("chat") : showHistory} aria-label={view === "history" ? "Back to chat" : "Past conversations"} className="flex h-8 w-8 items-center justify-center rounded-lg text-white/60 hover:bg-white/10 hover:text-white">
                  <History size={17} />
                </button>
                <button type="button" onClick={newChat} aria-label="New conversation" className="flex h-8 w-8 items-center justify-center rounded-lg text-white/60 hover:bg-white/10 hover:text-white">
                  <Plus size={18} />
                </button>
                <button type="button" onClick={onClose} aria-label="Close chat" className="flex h-8 w-8 items-center justify-center rounded-lg text-white/60 hover:bg-white/10 hover:text-white">
                  <X size={18} />
                </button>
              </div>

              {/* body */}
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5" aria-live="polite">
                {view === "history" ? (
                  <div>
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-brand-navy/40">Past conversations</p>
                    {history.length === 0 ? (
                      <p className="text-sm text-brand-navy/55">No conversations yet.</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {history.map((c) => (
                          <li key={c.id}>
                            <button type="button" onClick={() => openConversation(c.id)} className={`w-full rounded-xl px-3 py-2.5 text-left text-sm transition-colors hover:bg-white ${c.id === conversationId ? "bg-white ring-1 ring-brand-primary/20" : ""}`}>
                              <span className="block truncate font-medium text-brand-navy">{c.title}</span>
                              <span className="text-[11px] text-brand-navy/45">{new Date(c.updatedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : messages.length === 0 && loaded ? (
                  <div className="flex flex-col items-center pt-6 text-center">
                    <p className="text-lg font-bold text-brand-navy">Hi, I&rsquo;m {agentName}</p>
                    <p className="mt-1.5 max-w-xs text-sm text-brand-navy/60">
                      Ask me how anything on the platform works, what an indicator means, or help turning an idea into rules you can backtest.
                    </p>
                    <div className="mt-6 flex w-full flex-col gap-2">
                      {STARTERS.map((s) => (
                        <button key={s} type="button" onClick={() => send(s)} className="surface-interactive surface rounded-xl px-4 py-3 text-left text-sm font-medium text-brand-navy">
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <ul className="space-y-4">
                    {messages.map((m) =>
                      m.role === "user" ? (
                        <li key={m.id} className="flex justify-end">
                          <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-brand-primary px-4 py-2.5 text-sm leading-relaxed text-white">{m.content}</div>
                        </li>
                      ) : (
                        <li key={m.id} className="flex items-start gap-2">
                          <AgentAvatar pose={m.guardrailHit ? "alert" : "idle"} size={28} className="mt-0.5" />
                          <div className={`max-w-[88%] rounded-2xl rounded-tl-md px-4 py-2.5 text-sm leading-relaxed text-brand-navy/80 ${m.guardrailHit ? "bg-brand-gold/10 ring-1 ring-brand-gold/30" : "bg-white ring-1 ring-black/5"}`}>
                            <AssistantReply content={m.content} onNavigate={onClose} />
                          </div>
                        </li>
                      )
                    )}
                    {isPending && (
                      <li className="flex items-center gap-2" aria-label={`${agentName} is typing`}>
                        <AgentAvatar pose="thinking" size={28} />
                        <span className="flex gap-1 rounded-2xl bg-white px-4 py-3 ring-1 ring-black/5">
                          {[0, 1, 2].map((i) => (
                            <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-primary/50" style={{ animationDelay: `${i * 0.15}s` }} />
                          ))}
                        </span>
                      </li>
                    )}
                  </ul>
                )}
                <div ref={endRef} />
              </div>

              {/* composer */}
              <div className="shrink-0 border-t border-black/5 bg-white px-4 pb-4 pt-3">
                {error && <p className="mb-2 text-xs font-medium text-brand-sell">{error}</p>}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    send(draft);
                  }}
                  className="flex items-end gap-2 rounded-2xl border border-brand-navy/10 bg-brand-bg p-1.5 focus-within:border-brand-primary/50 focus-within:ring-2 focus-within:ring-brand-primary/10"
                >
                  <textarea
                    ref={inputRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value.slice(0, MAX_CHARS))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        send(draft);
                      }
                    }}
                    rows={1}
                    placeholder={`Ask ${agentName} anything…`}
                    aria-label={`Message ${agentName}`}
                    className="max-h-32 min-h-[40px] flex-1 resize-none bg-transparent px-2.5 py-2 text-sm text-brand-navy outline-none placeholder:text-brand-navy/35 [field-sizing:content]"
                  />
                  <button type="submit" disabled={!draft.trim() || isPending} aria-label="Send" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-primary text-white transition-colors hover:bg-brand-primary-light disabled:opacity-40">
                    <ArrowUp size={17} />
                  </button>
                </form>
                <p className="mt-2 text-center text-[10.5px] leading-snug text-brand-navy/40">
                  AI-generated — can be wrong. Never investment advice; past results don&rsquo;t guarantee future returns.
                </p>
              </div>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </BodyPortal>
  );
}
