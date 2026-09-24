"use client";

import { MessageCircle } from "lucide-react";
import { useAgentChat } from "./agent-chat-provider";

/** Opens the agent chat from anywhere in the app (e.g. the dashboard card). */
export default function AskAgentButton({ className = "" }: { className?: string }) {
  const { agentName, openChat } = useAgentChat();
  return (
    <button
      type="button"
      onClick={() => openChat()}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand-primary px-4 py-2 text-xs font-semibold text-white shadow-[0_6px_16px_-8px_rgba(71,24,152,0.6)] hover:bg-brand-primary-light ${className}`}
    >
      <MessageCircle size={13} /> Ask {agentName}
    </button>
  );
}
