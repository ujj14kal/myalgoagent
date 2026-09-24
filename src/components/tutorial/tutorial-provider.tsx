"use client";

import { createContext, useContext, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import TutorialTour, { type TourStep } from "./tutorial-tour";
import { setAgentNameAction, completeTutorialAction } from "@/lib/agent-actions";
import { DEFAULT_AGENT_NAME } from "@/lib/agent-constants";
import { useAgentChat } from "@/components/agent-chat/agent-chat-provider";

const STEPS: TourStep[] = [
  {
    id: "welcome",
    target: null,
    pose: "wave",
    title: "Hi, I'm {agent} — your agent",
    body: "I'll show you around in under a minute — what's here, what it does, and what's different about it. What would you like to call me?",
  },
  {
    id: "sidebar",
    target: '[data-tour="sidebar-nav"]',
    pose: "point",
    title: "Everything lives here",
    body: "Strategies, backtests, paper trading, risk controls, your account — all one click away. No hunting through menus.",
  },
  {
    id: "portfolio-chart",
    target: '[data-tour="portfolio-chart"]',
    pose: "analyzing",
    title: "Your portfolio, over time",
    body: "This tracks your combined paper-trading equity as your strategies run, built from your real order history — not a simulated demo feed.",
  },
  {
    id: "pnl-summary",
    target: '[data-tour="pnl-summary"]',
    pose: "talk",
    title: "P&L at a glance",
    body: "Today, this week, this month and all-time realised P&L — green is up, red is down, grey is flat. No digging through a spreadsheet.",
  },
  {
    id: "strategies-list",
    target: '[data-tour="strategies-list"]',
    pose: "working",
    title: "Your strategies",
    body: "Build one visually or with code, then backtest it against real historical data with no look-ahead bias — most tools let a strategy accidentally 'see the future'; this one can't.",
  },
  {
    id: "notifications",
    target: '[data-tour="notifications-bell"]',
    pose: "alert",
    title: "I'll ping you here",
    body: "Order fills, risk events, session changes — I'll pop up in the corner like this and log them here too, so you never miss something that needs you.",
  },
  {
    id: "risk-gauge",
    target: '[data-tour="risk-gauge"]',
    pose: "guarding",
    title: "Your safety net",
    body: "Set a max-loss limit and I enforce it server-side — even if a strategy or a bug tries to ignore it. That's the part most hobby bots skip.",
  },
  {
    // Last stop: where the agent lives. On "Let's go" it hops into this
    // button (see finish below), so users learn where to find it.
    id: "home",
    target: '[data-tour="agent-home"]',
    pose: "beam",
    title: "If you ever need me, I live right here",
    body: "Ask me anything — how something works, what an indicator means, or help turning an idea into rules you can backtest. I explain, you decide: I never give buy or sell calls. You can replay this tour any time from Agent Settings.",
  },
];

type TutorialContextValue = { startTour: () => void };
const TutorialContext = createContext<TutorialContextValue | null>(null);

export function useTutorial(): TutorialContextValue {
  const ctx = useContext(TutorialContext);
  if (!ctx) throw new Error("useTutorial must be used within TutorialProvider");
  return ctx;
}

export default function TutorialProvider({
  initialAgentName,
  tutorialCompleted,
  children,
}: {
  initialAgentName: string | null;
  tutorialCompleted: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(!tutorialCompleted);
  const [stepIndex, setStepIndex] = useState(0);
  const [agentName, setAgentName] = useState(initialAgentName ?? DEFAULT_AGENT_NAME);
  const [nameDraft, setNameDraft] = useState(initialAgentName ?? "");
  const [saving, setSaving] = useState(false);

  const pathname = usePathname();
  const router = useRouter();
  // The tour's steps point at dashboard elements, so replaying it from any
  // other page goes to the dashboard first instead of spotlighting nothing.
  const startTour = () => {
    setStepIndex(0);
    if (pathname !== "/app/dashboard") router.push("/app/dashboard");
    setOpen(true);
  };

  const close = async () => {
    setOpen(false);
    if (!tutorialCompleted) await completeTutorialAction();
  };

  const { flyHome } = useAgentChat();
  // Finishing (not skipping) ends with the agent hopping from the tour card
  // into its home button — measured before the tour unmounts.
  const finish = async () => {
    const agentEl = document.querySelector("[data-tour-agent]");
    const r = agentEl?.getBoundingClientRect();
    await close();
    flyHome(r ? { left: r.left, top: r.top, width: r.width, height: r.height } : null);
  };

  const submitName = async () => {
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      setStepIndex((i) => i + 1);
      return;
    }
    setSaving(true);
    const res = await setAgentNameAction(trimmed);
    setSaving(false);
    if (res.ok) setAgentName(res.agentName);
    setStepIndex((i) => i + 1);
  };

  const namingSlot = (
    <div className="flex items-center gap-2">
      <input
        value={nameDraft}
        onChange={(e) => setNameDraft(e.target.value)}
        placeholder={DEFAULT_AGENT_NAME}
        maxLength={24}
        className="w-full rounded-full border border-brand-navy/15 px-4 py-2 text-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/15"
      />
      <button
        type="button"
        disabled={saving}
        onClick={submitName}
        className="shrink-0 rounded-full bg-brand-primary px-4 py-2 text-xs font-semibold text-white hover:bg-brand-primary-light disabled:opacity-50"
      >
        {saving ? "Saving…" : "Set name"}
      </button>
    </div>
  );

  return (
    <TutorialContext.Provider value={{ startTour }}>
      {children}
      <TutorialTour
        open={open}
        steps={STEPS}
        stepIndex={stepIndex}
        agentName={agentName}
        namingSlot={namingSlot}
        onNext={() => setStepIndex((i) => Math.min(i + 1, STEPS.length - 1))}
        onBack={() => setStepIndex((i) => Math.max(i - 1, 0))}
        onSkip={close}
        onFinish={finish}
      />
    </TutorialContext.Provider>
  );
}
