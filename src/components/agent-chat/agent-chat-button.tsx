"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { MessageCircle } from "lucide-react";
import AgentAvatar from "@/components/ui/agent-avatar";
import { useAgentChat } from "./agent-chat-provider";

/**
 * Where the agent "lives": the button that opens the chat. `card` sits in the
 * sidebar agent card (desktop and the phone menu); `fab` floats bottom-right
 * on phones, where there's no sidebar. Both carry data-agent-home so the tour
 * can point at — and fly the agent into — whichever one is visible.
 */
export default function AgentChatButton({ variant, onOpen }: { variant: "card" | "fab"; onOpen?: () => void }) {
  const { agentName, openChat, homeSignal, isOpen } = useAgentChat();
  const reduce = useReducedMotion();
  const [celebrating, setCelebrating] = useState(false);

  // The welcome bounce when the agent lands here at the end of the tour.
  useEffect(() => {
    if (homeSignal === 0) return;
    const start = setTimeout(() => setCelebrating(true), 0);
    const stop = setTimeout(() => setCelebrating(false), 1600);
    return () => {
      clearTimeout(start);
      clearTimeout(stop);
    };
  }, [homeSignal]);

  const bounce =
    celebrating && !reduce ? { scale: [1, 1.14, 0.95, 1.06, 1], y: [0, -6, 0, -2, 0] } : { scale: 1, y: 0 };
  const open = () => {
    onOpen?.();
    openChat();
  };

  if (variant === "fab") {
    return (
      <motion.button
        type="button"
        onClick={open}
        data-agent-home
        data-tour="agent-home"
        aria-label={`Ask ${agentName}`}
        aria-expanded={isOpen}
        animate={bounce}
        transition={{ duration: 0.9 }}
        className={`fixed bottom-4 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-[0_12px_30px_-8px_rgba(71,24,152,0.55)] ring-1 ring-brand-primary/15 transition-shadow md:hidden ${
          celebrating ? "ring-4 ring-brand-gold/60" : ""
        } ${isOpen ? "pointer-events-none opacity-0" : ""}`}
      >
        <AgentAvatar pose={celebrating ? "happy" : "idle"} size={46} />
        <span className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand-primary text-white ring-2 ring-white">
          <MessageCircle size={11} />
        </span>
      </motion.button>
    );
  }

  return (
    <motion.button
      type="button"
      onClick={open}
      data-agent-home
      data-tour="agent-home"
      aria-expanded={isOpen}
      animate={bounce}
      transition={{ duration: 0.9 }}
      className={`group mt-2.5 flex w-full items-center justify-center gap-2 rounded-xl bg-white/[0.1] px-3 py-2 text-sm font-semibold text-white ring-1 ring-white/15 transition-colors hover:bg-white/[0.16] ${
        celebrating ? "bg-brand-gold/25 ring-2 ring-brand-gold/70" : ""
      }`}
    >
      <MessageCircle size={15} className="text-brand-gold" />
      <span className="truncate">Ask {agentName}</span>
    </motion.button>
  );
}
