"use client";

import { useState } from "react";
import PaymentOverlay, { type PaymentOverlayState } from "@/components/billing/payment-overlay";

const perks = ["8,000 credits every month, ready now", "AI assistant with voice and intraday backtests", "Up to 20 live strategies and 100 forward tests", "Your own static IP for live orders"];

export default function PreviewClient({ scene }: { scene: string }) {
  const scenes: Record<string, PaymentOverlayState> = {
    processing: { kind: "processing", what: "your Pro plan" },
    plan: { kind: "success", variant: "plan", planLabel: "Trade", perks: perks.map((p) => p.replace("8,000", "3,000").replace("20 live", "5 live").replace("100 forward", "30 forward")) },
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
