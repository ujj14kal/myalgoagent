"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import Agent2D, { type AgentPose } from "@/components/robot/agent-2d";
import { useAgentChat } from "@/components/agent-chat/agent-chat-provider";

type Severity = "info" | "warning" | "success" | "danger";
type Toast = { id: string; severity: Severity; message: string; askable?: boolean };

// Events worth a follow-up question get an "Ask {agent}" button on their toast.
const ASKABLE = new Set(["ORDER_FILLED", "RISK_EVENT", "SESSION_STOPPED"]);

const SEVERITY: Record<Severity, { ring: string; bar: string; label: string; pose: AgentPose }> = {
  info: { ring: "ring-brand-blue/20", bar: "bg-brand-blue", label: "Update", pose: "talk" },
  warning: { ring: "ring-brand-gold/40", bar: "bg-brand-gold", label: "Heads up", pose: "alert" },
  success: { ring: "ring-brand-buy/25", bar: "bg-brand-buy", label: "Done", pose: "happy" },
  danger: { ring: "ring-brand-sell/30", bar: "bg-brand-sell", label: "Warning", pose: "alert" },
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

  const { openChat } = useAgentChat();
  const push = useCallback((severity: Severity, message: string, askable = false) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev.slice(-2), { id, severity, message, askable }]);
    // Risk alerts and anything the user can ask about stay up longer.
    const lifetime = askable || severity === "warning" || severity === "danger" ? TOAST_LIFETIME_MS * 2 : TOAST_LIFETIME_MS;
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), lifetime);
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
          push(NOTIFICATION_SEVERITY[n.type] ?? "info", n.message, ASKABLE.has(n.type));
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
      <div className="pointer-events-none fixed bottom-20 right-4 z-[70] md:bottom-4 flex w-[min(90vw,340px)] flex-col gap-3">
        <AnimatePresence initial={false}>
          {toasts.map((t) => {
            const style = SEVERITY[t.severity];
            return (
              <motion.div
                key={t.id}
                layout
                role="status"
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 60, transition: { duration: 0.2 } }}
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
                className={`pointer-events-auto relative flex items-end gap-2 overflow-hidden rounded-2xl bg-white/95 p-3 pr-8 shadow-[0_18px_40px_-16px_rgba(14,27,45,0.35)] ring-1 backdrop-blur ${style.ring}`}
              >
                <Agent2D pose={style.pose} size={54} trackCursor={false} className="-mb-1 shrink-0" />
                <div className="min-w-0 pb-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-navy/45">
                    {agentName} · {style.label}
                  </p>
                  <p className="text-sm font-medium text-brand-navy">{t.message}</p>
                  {t.askable && (
                    <button
                      type="button"
                      onClick={() => {
                        setToasts((prev) => prev.filter((x) => x.id !== t.id));
                        openChat(`Explain this for me and tell me what I can do next: "${t.message}"`);
                      }}
                      className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-brand-primary/[0.08] px-2.5 py-1 text-[11px] font-semibold text-brand-primary hover:bg-brand-primary hover:text-white"
                    >
                      Ask {agentName} →
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  aria-label="Dismiss"
                  onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
                  className="absolute right-2 top-2 rounded-md p-1 text-brand-navy/35 hover:bg-brand-navy/5 hover:text-brand-navy"
                >
                  <X size={14} />
                </button>
                <motion.span
                  className={`absolute bottom-0 left-0 h-0.5 ${style.bar}`}
                  initial={{ width: "100%" }}
                  animate={{ width: "0%" }}
                  transition={{ duration: (t.askable || t.severity === "warning" || t.severity === "danger" ? TOAST_LIFETIME_MS * 2 : TOAST_LIFETIME_MS) / 1000, ease: "linear" }}
                />
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </AgentToastContext.Provider>
  );
}
