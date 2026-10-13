"use client";

import { MessageSquareText, Sparkles } from "lucide-react";
import { useAgentChat } from "./agent-chat-provider";
import type { BuildKind } from "./build-window";

const LABEL: Record<BuildKind, string> = { strategy: "Talk to", concept: "Describe it to", block: "Describe it to", indicator: "Describe it to" };

/** Opens the in-page build window — talk to the assistant right where you are. With `fullChat` (the dashboard briefing) it opens the full assistant chat instead. */
export default function TalkToAgentButton({ kind = "strategy", variant = "outline", className = "", fullChat = false }: { kind?: BuildKind; variant?: "outline" | "onDark"; className?: string; fullChat?: boolean }) {
  const { agentName, openBuild, openChat } = useAgentChat();
  const Icon = kind === "strategy" ? MessageSquareText : Sparkles;
  return (
    <button
      type="button"
      onClick={() => (fullChat ? openChat() : openBuild(kind))}
      className={`inline-flex items-center gap-2 rounded-full text-sm font-semibold transition-colors ${
        variant === "onDark" ? "px-4 py-2 text-white/90 ring-1 ring-white/30 hover:bg-white/10" : "border border-brand-primary/30 px-4 py-2 text-brand-primary hover:bg-brand-primary/5"
      } ${className}`}
    >
      <Icon size={15} /> {LABEL[kind]} {agentName}
    </button>
  );
}
