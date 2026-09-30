"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, LogOut, Pause, Play, Square, X } from "lucide-react";
import { confirmDeploymentSignal, dismissDeploymentSignal, exitDeploymentNow, setDeployment } from "@/lib/live-actions";

const btn = "inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 disabled:opacity-40";

/** Pause / resume / stop / exit-now for one live deployment. */
export function DeploymentControls({ id, status, hasPosition }: { id: string; status: string; hasPosition: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? (r.message ?? null) : (r.error ?? "Didn't work"));
      router.refresh();
    });
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {status === "ACTIVE" && (
        <button type="button" disabled={pending} onClick={() => run(() => setDeployment(id, "PAUSED"))} className={`${btn} text-brand-navy/70 ring-black/10`}>
          <Pause size={12} /> Pause
        </button>
      )}
      {status === "PAUSED" && (
        <button type="button" disabled={pending} onClick={() => run(() => setDeployment(id, "ACTIVE"))} className={`${btn} text-[#0b6b30] ring-brand-buy/30`}>
          <Play size={12} /> Resume
        </button>
      )}
      {hasPosition && status !== "STOPPED" && (
        <button type="button" disabled={pending} onClick={() => run(() => exitDeploymentNow(id), "Close this strategy's open position now with a market order?")} className={`${btn} text-[#9b1111] ring-brand-sell/30`}>
          <LogOut size={12} /> Exit now
        </button>
      )}
      {status !== "STOPPED" && (
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => setDeployment(id, "STOPPED"), hasPosition ? "Stop this strategy? Its open position stays open at your broker — use Exit now first if you want it closed." : "Stop this strategy? It won't place any more orders.")}
          className={`${btn} text-brand-navy/60 ring-black/10`}
        >
          <Square size={11} /> Stop
        </button>
      )}
      {msg && <span className="text-xs text-brand-navy/60">{msg}</span>}
    </div>
  );
}

/** A CONFIRM-mode signal waiting for the user: send it, or skip it. */
export function PendingSignalActions({ id, index }: { id: string; index: number }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await confirmDeploymentSignal(id, index);
            setMsg(r.ok ? (r.message ?? "Sent.") : r.error);
            router.refresh();
          })
        }
        className={`${btn} bg-brand-primary text-white ring-brand-primary`}
      >
        <Check size={12} /> Send to broker
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            await dismissDeploymentSignal(id, index);
            router.refresh();
          })
        }
        className={`${btn} text-brand-navy/60 ring-black/10`}
      >
        <X size={12} /> Skip
      </button>
      {msg && <span className="text-xs text-brand-navy/60">{msg}</span>}
    </span>
  );
}
