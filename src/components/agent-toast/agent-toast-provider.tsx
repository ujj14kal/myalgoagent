"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import RobotAvatar from "@/components/robot/robot-avatar";
import type { RobotPose } from "@/components/robot/robot-mascot";

type Severity = "info" | "warning" | "success" | "danger";
type Toast = { id: string; severity: Severity; message: string };

const SEVERITY: Record<Severity, { border: string; bg: string; pose: RobotPose }> = {
  info: { border: "border-brand-blue/30", bg: "bg-brand-blue-light", pose: "talk" },
  warning: { border: "border-brand-gold/40", bg: "bg-brand-gold/10", pose: "alert" },
  success: { border: "border-brand-buy/30", bg: "bg-brand-buy/10", pose: "happy" },
  danger: { border: "border-brand-sell/30", bg: "bg-brand-sell/10", pose: "sad" },
};

const NOTIFICATION_SEVERITY: Record<string, Severity> = {
  ORDER_FILLED: "success",
  RISK_EVENT: "warning",
  SESSION_STOPPED: "info",
};

const LAST_SEEN_KEY = "maa-notifications-last-seen";
const POLL_MS = 15_000;
const TOAST_LIFETIME_MS = 6_000;

type AgentToastApi = {
  info: (message: string) => void;
  warning: (message: string) => void;
  success: (message: string) => void;
  danger: (message: string) => void;
};

const AgentToastContext = createContext<AgentToastApi | null>(null);

export function useAgentToast(): AgentToastApi {
  const ctx = useContext(AgentToastContext);
  if (!ctx) throw new Error("useAgentToast must be used within AgentToastProvider");
  return ctx;
}

export default function AgentToastProvider({
  agentName,
  children,
}: {
  agentName: string;
  children: React.ReactNode;
}) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const sinceRef = useRef<string>(new Date().toISOString());

  const push = useCallback((severity: Severity, message: string) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev.slice(-2), { id, severity, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), TOAST_LIFETIME_MS);
  }, []);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(LAST_SEEN_KEY);
      if (stored) sinceRef.current = stored;
    } catch {
      // localStorage unavailable — poll from mount time only
    }

    let stopped = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/notifications/recent?since=${encodeURIComponent(sinceRef.current)}`);
        if (!res.ok || stopped) return;
        const data = (await res.json()) as {
          notifications: { type: string; message: string }[];
          serverTime: string;
        };
        for (const n of data.notifications) {
          push(NOTIFICATION_SEVERITY[n.type] ?? "info", n.message);
        }
        sinceRef.current = data.serverTime;
        try {
          localStorage.setItem(LAST_SEEN_KEY, data.serverTime);
        } catch {
          // best-effort persistence only
        }
      } catch {
        // transient network error — next poll tries again
      }
    };

    const interval = setInterval(poll, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(interval);
    };
  }, [push]);

  const api: AgentToastApi = {
    info: (m) => push("info", m),
    warning: (m) => push("warning", m),
    success: (m) => push("success", m),
    danger: (m) => push("danger", m),
  };

  return (
    <AgentToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[70] flex w-[min(90vw,340px)] flex-col gap-3">
        <AnimatePresence initial={false}>
          {toasts.map((t) => {
            const style = SEVERITY[t.severity];
            return (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: 16, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 40, transition: { duration: 0.2 } }}
                className={`pointer-events-auto flex items-start gap-3 rounded-2xl border ${style.border} ${style.bg} bg-white p-3 shadow-lg shadow-black/10`}
              >
                <RobotAvatar pose={style.pose} size={40} />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-brand-navy">{agentName} says</p>
                  <p className="text-sm text-brand-navy/80">{t.message}</p>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </AgentToastContext.Provider>
  );
}
