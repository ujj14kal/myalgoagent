"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import Agent2D, { type AgentPose } from "@/components/robot/agent-2d";

type Severity = "info" | "warning" | "success" | "danger";
type Toast = { id: string; severity: Severity; message: string };

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
                  transition={{ duration: TOAST_LIFETIME_MS / 1000, ease: "linear" }}
                />
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </AgentToastContext.Provider>
  );
}
