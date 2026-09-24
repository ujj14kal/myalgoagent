"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { HeartPulse } from "lucide-react";
import type { HealthAlert } from "@/lib/health";
import { setPaperSessionStatus, stopDuplicateSessionsAction } from "@/lib/paper-actions";

const SEVERITY_STYLE: Record<HealthAlert["severity"], { badge: string; dot: string; label: string }> = {
  CRITICAL: { badge: "bg-brand-sell/10 text-brand-sell", dot: "bg-brand-sell", label: "Critical" },
  WARNING: { badge: "bg-brand-gold/15 text-brand-gold", dot: "bg-brand-gold", label: "Mild" },
};

/** Every action here is destructive/state-changing enough (stopping a live
 * session, stopping several at once) to warrant an explicit "are you sure"
 * — this panel never acts on a click alone. A plain link (e.g. to Risk
 * Controls) needs no such confirmation since it doesn't change anything by
 * itself. */
function ConfirmDialog({
  title,
  description,
  confirmLabel,
  onConfirm,
  onCancel,
  pending,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  pending: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end bg-black/20 p-6 sm:items-center sm:justify-center">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <p className="text-sm font-semibold text-brand-navy">{title}</p>
        <p className="mt-2 text-xs text-brand-navy/60">{description}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="rounded-full border border-brand-navy/15 px-4 py-1.5 text-xs font-semibold text-brand-navy disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="rounded-full bg-brand-primary px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            {pending ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function AlertRow({ alert }: { alert: HealthAlert }) {
  const style = SEVERITY_STYLE[alert.severity];
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  function runAction() {
    if (!alert.action) return;
    startTransition(async () => {
      if (alert.action!.kind === "stop-session") {
        await setPaperSessionStatus(alert.action!.sessionId, "STOPPED");
      } else if (alert.action!.kind === "stop-duplicate-sessions") {
        await stopDuplicateSessionsAction(alert.action!.strategyId, alert.action!.keepSessionId);
      }
      setConfirming(false);
    });
  }

  return (
    <div className="flex items-start gap-3 rounded-xl border border-black/5 bg-brand-bg/50 p-3">
      <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${style.dot}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${style.badge}`}>
            {style.label}
          </span>
          <p className="truncate text-sm font-semibold text-brand-navy">{alert.title}</p>
        </div>
        <p className="mt-1 text-xs text-brand-navy/60">{alert.description}</p>
        {alert.action && (
          <div className="mt-2">
            {alert.action.kind === "link" ? (
              <Link href={alert.action.href} className="text-xs font-semibold text-brand-primary hover:underline">
                {alert.action.label} →
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="text-xs font-semibold text-brand-primary hover:underline"
              >
                {alert.action.label} →
              </button>
            )}
          </div>
        )}
      </div>

      {confirming && alert.action && alert.action.kind !== "link" && (
        <ConfirmDialog
          title={`${alert.action.label}?`}
          description={
            alert.action.kind === "stop-session"
              ? "This moves the session to history — it stops syncing live, but all its trade history and P&L stay exactly as they are."
              : `This stops ${alert.action.count} redundant session${alert.action.count === 1 ? "" : "s"} on this strategy, keeping the most recently started one live. All of their trade history stays intact.`
          }
          confirmLabel={alert.action.label}
          pending={isPending}
          onConfirm={runAction}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}

export default function HealthPanel({ alerts }: { alerts: HealthAlert[] }) {
  if (alerts.length === 0) {
    return (
      <div className="surface flex items-center gap-3 p-5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-buy/10 text-brand-buy">
          <HeartPulse size={19} />
        </span>
        <div>
          <p className="text-sm font-semibold text-brand-navy">Health · all clear</p>
          <p className="text-xs text-brand-navy/50">No risk, redundancy, or sync issues found right now.</p>
        </div>
      </div>
    );
  }

  const criticalCount = alerts.filter((a) => a.severity === "CRITICAL").length;

  return (
    <div className={`surface p-5 ${criticalCount > 0 ? "ring-1 ring-brand-sell/25" : ""}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className={`flex h-8 w-8 items-center justify-center rounded-xl ${criticalCount > 0 ? "bg-brand-sell/10 text-brand-sell" : "bg-brand-gold/15 text-[#8a7437]"}`}>
            <HeartPulse size={16} />
          </span>
          <p className="text-sm font-semibold text-brand-navy">Health</p>
        </div>
        {criticalCount > 0 && (
          <span className="rounded-full bg-brand-sell/10 px-2 py-0.5 text-xs font-semibold text-brand-sell">
            {criticalCount} critical
          </span>
        )}
      </div>
      <div className="mt-3 space-y-2">
        {alerts.map((alert) => (
          <AlertRow key={alert.id} alert={alert} />
        ))}
      </div>
    </div>
  );
}
