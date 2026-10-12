"use client";

import { useState } from "react";
import PaymentOverlay, { type PaymentOverlayState } from "@/components/billing/payment-overlay";

const perks = ["4,000 credits every month, ready now", "AI assistant with voice and intraday backtests", "Up to 10 live strategies and 40 forward tests", "Your own static IP for live orders"];

export default function PreviewClient({ scene }: { scene: string }) {
  const scenes: Record<string, PaymentOverlayState> = {
    processing: { kind: "processing", what: "your Pro plan" },
    plan: { kind: "success", variant: "plan", planLabel: "Trade", perks: perks.map((p) => p.replace("4,000", "1,500").replace("10 live", "3 live").replace("40 forward", "15 forward")) },
    pro: { kind: "success", variant: "plan", planLabel: "Pro", perks },
    topup: { kind: "success", variant: "topup", credits: 750 },
    error: { kind: "error", message: "Your bank declined the payment." },
  };
  const [state, setState] = useState<PaymentOverlayState | null>(scenes[scene] ?? scenes.plan);
  return (
    <main className="p-8">
      <button className="rounded-full bg-brand-primary px-4 py-2 text-white" onClick={() => setState(scenes[scene] ?? scenes.plan)}>Replay</button>
      <PaymentOverlay state={state} onClose={() => setState(null)} />
    </main>
  );
}
