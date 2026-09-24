"use client";

import Link from "next/link";
import { Settings2 } from "lucide-react";
import AgentAvatar from "@/components/ui/agent-avatar";
import AgentChatButton from "@/components/agent-chat/agent-chat-button";
import { useHomeCelebration } from "@/components/agent-chat/agent-chat-provider";

/**
 * The agent's home in the sidebar: who it is, what it's doing right now, and
 * the button to talk to it. `onAsk` lets the phone menu close itself first.
 */
export default function AgentStatusCard({
  agentName,
  liveSessions,
  onAsk,
}: {
  agentName: string;
  liveSessions: number;
  onAsk?: () => void;
}) {
  const justArrived = useHomeCelebration();
  const status =
    liveSessions > 0 ? `Watching ${liveSessions} live session${liveSessions === 1 ? "" : "s"}` : "On standby — nothing running";
  return (
    <div className="rounded-2xl bg-white/[0.06] p-2.5 ring-1 ring-white/10">
      <div className="flex items-center gap-3">
        <AgentAvatar pose={justArrived ? "happy" : liveSessions > 0 ? "idle" : "sleep"} size={38} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-white">{agentName}</span>
          <span className="flex items-center gap-1.5 text-[11px] text-white/55">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${liveSessions > 0 ? "bg-brand-buy" : "bg-white/30"}`} />
            <span className="truncate">{status}</span>
          </span>
        </span>
        <Link
          href="/app/agent-settings"
          onClick={onAsk}
          aria-label="Agent settings"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white/45 transition-colors hover:bg-white/10 hover:text-white"
        >
          <Settings2 size={15} />
        </Link>
      </div>
      <AgentChatButton variant="card" onOpen={onAsk} />
    </div>
  );
}
