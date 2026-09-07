"use client";

import { createContext, useContext, useState } from "react";
import TutorialTour, { type TourStep } from "./tutorial-tour";
import { setAgentNameAction, completeTutorialAction } from "@/lib/agent-actions";
import { DEFAULT_AGENT_NAME } from "@/lib/agent-constants";

const STEPS: TourStep[] = [
  {
    id: "welcome",
    target: null,
    pose: "talk",
    title: "Hi, I'm your {agent}",
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
    pose: "talk",
    title: "Your portfolio, over time",
    body: "This tracks your combined paper-trading equity as your strategies run, built from your real order history — not a simulated demo feed.",
  },
  {
    id: "pnl-summary",
    target: '[data-tour="pnl-summary"]',
    pose: "talk",
    title: "P&L at a glance",
    body: "Today, this week, this month, and all-time — green means you're up, red means you're down. No digging through a spreadsheet.",
  },
  {
    id: "strategies-list",
    target: '[data-tour="strategies-list"]',
    pose: "point",
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
    pose: "thinking",
    title: "Your safety net",
    body: "Set a max-loss limit and I enforce it server-side — even if a strategy or a bug tries to ignore it. That's the part most hobby bots skip.",
  },
  {
    id: "finish",
    target: null,
    pose: "happy",
    title: "That's it — you're set",
    body: "You can replay this tour anytime from your account page or the clock icon up top. Now let's go build something.",
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

  const startTour = () => {
    setStepIndex(0);
    setOpen(true);
  };

  const close = async () => {
    setOpen(false);
    if (!tutorialCompleted) await completeTutorialAction();
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
        className="w-full rounded-full border border-brand-navy/15 px-3 py-1.5 text-sm focus:border-brand-primary focus:outline-none"
      />
      <button
        type="button"
        disabled={saving}
        onClick={submitName}
        className="shrink-0 rounded-full bg-brand-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-primary-light disabled:opacity-50"
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
        onFinish={close}
      />
    </TutorialContext.Provider>
  );
}
