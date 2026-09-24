"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import BodyPortal from "@/components/ui/body-portal";
import Agent2D from "@/components/robot/agent-2d";
import AgentChatPanel from "./agent-chat-panel";

type Rect = { left: number; top: number; width: number; height: number };

type AgentChatContextValue = {
  agentName: string;
  isOpen: boolean;
  openChat: () => void;
  closeChat: () => void;
  /** Increments each time the agent "arrives home" — the chat button plays its welcome bounce. */
  homeSignal: number;
  /** The agent jumps from `from` into the chat button, then the button bounces. */
  flyHome: (from: Rect | null) => void;
};

const AgentChatContext = createContext<AgentChatContextValue | null>(null);

export function useAgentChat(): AgentChatContextValue {
  const ctx = useContext(AgentChatContext);
  if (!ctx) throw new Error("useAgentChat must be used within AgentChatProvider");
  return ctx;
}

/** The visible chat button (sidebar card on desktop, floating button on phones). */
export function findAgentHome(): HTMLElement | null {
  // Hidden (display:none) buttons have an empty box; the floating one is
  // position:fixed, so offsetParent can't be used to tell.
  for (const el of document.querySelectorAll<HTMLElement>("[data-agent-home]")) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

const FLIGHT_SIZE = 96;

export default function AgentChatProvider({ agentName, children }: { agentName: string; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  const [isOpen, setIsOpen] = useState(false);
  const [homeSignal, setHomeSignal] = useState(0);
  const [flight, setFlight] = useState<{ from: Rect; to: Rect } | null>(null);

  const openChat = useCallback(() => setIsOpen(true), []);
  const closeChat = useCallback(() => setIsOpen(false), []);

  const flyHome = useCallback(
    (from: Rect | null) => {
      const home = findAgentHome();
      if (!home || !from || reduce) {
        setHomeSignal((n) => n + 1);
        return;
      }
      const r = home.getBoundingClientRect();
      setFlight({ from, to: { left: r.left, top: r.top, width: r.width, height: r.height } });
    },
    [reduce]
  );

  // Flight path: centre of the tour's agent → a hop up → into the button's centre, shrinking as it goes.
  const path = flight && {
    x0: flight.from.left + flight.from.width / 2 - FLIGHT_SIZE / 2,
    y0: flight.from.top + flight.from.height / 2 - FLIGHT_SIZE / 2,
    x1: flight.to.left + flight.to.width / 2 - FLIGHT_SIZE / 2,
    y1: flight.to.top + flight.to.height / 2 - FLIGHT_SIZE / 2,
  };

  return (
    <AgentChatContext.Provider value={{ agentName, isOpen, openChat, closeChat, homeSignal, flyHome }}>
      {children}
      <AgentChatPanel open={isOpen} onClose={closeChat} agentName={agentName} />
      <BodyPortal>
        <AnimatePresence>
          {flight && path && (
            <motion.div
              key="agent-flight"
              aria-hidden
              className="pointer-events-none fixed left-0 top-0 z-[95]"
              style={{ width: FLIGHT_SIZE, height: FLIGHT_SIZE * 1.25 }}
              initial={{ x: path.x0, y: path.y0, scale: 1, opacity: 1 }}
              animate={{
                x: [path.x0, path.x0 + (path.x1 - path.x0) * 0.35, path.x1],
                y: [path.y0, Math.min(path.y0, path.y1) - 90, path.y1],
                scale: [1, 0.9, 0.18],
                opacity: [1, 1, 0],
              }}
              transition={{ duration: 1.05, ease: [0.45, 0, 0.3, 1], times: [0, 0.45, 1] }}
              onAnimationComplete={() => {
                setFlight(null);
                setHomeSignal((n) => n + 1);
              }}
            >
              <Agent2D pose="happy" size={FLIGHT_SIZE} trackCursor={false} />
            </motion.div>
          )}
        </AnimatePresence>
      </BodyPortal>
    </AgentChatContext.Provider>
  );
}
