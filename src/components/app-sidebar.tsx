"use client";

import Link from "next/link";
import Image from "next/image";
import FeedbackWidget from "@/components/feedback-widget";
import AppNavList from "@/components/app-nav-list";
import AgentStatusCard from "@/components/agent-status-card";

export default function AppSidebar({ agentName, liveSessions }: { agentName: string; liveSessions: number }) {
  return (
    // sticky + h-screen keeps the nav pinned while a long page scrolls. Only
    // the nav list scrolls internally, so the agent card and Feedback button
    // at the bottom are always visible.
    <aside className="app-sidebar-bg sticky top-0 hidden h-screen w-64 shrink-0 flex-col text-white md:flex">
      <div className="flex h-16 shrink-0 items-center gap-2.5 px-5">
        <Link href="/app/dashboard" className="flex items-center gap-2.5">
          <Image src="/brand/icon-mark.png" alt="" width={30} height={30} className="rounded-lg ring-1 ring-white/20" />
          <span className="text-base font-bold tracking-tight text-white">MyAlgoAgent</span>
        </Link>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-2 [scrollbar-color:rgba(255,255,255,0.15)_transparent] [scrollbar-width:thin]">
        <AppNavList layoutId="sidebar-active" />
      </div>
      <div className="shrink-0 space-y-3 border-t border-white/10 p-3">
        <AgentStatusCard agentName={agentName} liveSessions={liveSessions} />
        <FeedbackWidget />
      </div>
    </aside>
  );
}
