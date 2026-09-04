"use client";

import { useTransition } from "react";
import { toggleKillSwitch } from "@/lib/risk-actions";

export default function KillSwitchToggle({ enabled }: { enabled: boolean }) {
  const [isPending, startTransition] = useTransition();

  return (
    <div
      className={`flex items-center justify-between rounded-2xl border p-5 ${
        enabled ? "border-brand-sell/30 bg-brand-sell/5" : "border-brand-buy/30 bg-brand-buy/5"
      }`}
    >
      <div>
        <p className={`text-sm font-bold ${enabled ? "text-brand-sell" : "text-brand-buy"}`}>
          {enabled ? "Trading halted" : "Trading allowed"}
        </p>
        <p className="mt-1 text-xs text-brand-navy/60">
          {enabled
            ? "The kill switch is on — no paper session can open a new position until it's turned off."
            : "The kill switch is off. All your paper sessions can open new positions normally."}
        </p>
      </div>
      <button
        type="button"
        disabled={isPending}
        onClick={() => startTransition(() => toggleKillSwitch(!enabled))}
        className={`rounded-full px-5 py-2 text-sm font-semibold text-white disabled:opacity-50 ${
          enabled ? "bg-brand-buy hover:opacity-90" : "bg-brand-sell hover:opacity-90"
        }`}
      >
        {isPending ? "Updating…" : enabled ? "Resume trading" : "Halt trading"}
      </button>
    </div>
  );
}
