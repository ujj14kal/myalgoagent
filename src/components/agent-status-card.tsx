"use client";

import Link from "next/link";
import AgentAvatar from "@/components/ui/agent-avatar";

/** The agent's always-visible presence in the sidebar: who it is and what it's doing right now. */
export default function AgentStatusCard({ agentName, liveSessions }: { agentName: string; liveSessions: number }) {
  const status =
    liveSessions > 0 ? `Watching ${liveSessions} live session${liveSessions === 1 ? "" : "s"}` : "On standby — nothing running";
  return (
    <Link
      href="/app/agent-settings"
      className="flex items-center gap-3 rounded-2xl bg-white/[0.06] p-2.5 ring-1 ring-white/10 transition-colors hover:bg-white/[0.1]"
    >
      <AgentAvatar pose={liveSessions > 0 ? "idle" : "sleep"} size={38} />
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-white">{agentName}</span>
        <span className="flex items-center gap-1.5 text-[11px] text-white/55">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${liveSessions > 0 ? "bg-brand-buy" : "bg-white/30"}`} />
          <span className="truncate">{status}</span>
        </span>
      </span>
    </Link>
  );
}
