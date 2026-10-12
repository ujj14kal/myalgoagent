"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { grantUserCredits, setUserPlan } from "@/lib/admin/actions";

const PLANS = [
  ["FREE", "Free"],
  ["TRADE", "Trade ₹1,999 + GST"],
  ["PRO", "Pro ₹3,499 + GST"],
] as const;

/** Moves a customer between plans and adds credits (a top-up they paid for, or a goodwill grant). */
export default function CreditControls({ userId, plan }: { userId: string; plan: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [chosen, setChosen] = useState(plan);
  const [amount, setAmount] = useState("250");
  const [kind, setKind] = useState<"TOPUP" | "GRANT">("TOPUP");
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const done = (r: { ok: boolean; message?: string; error?: string }) => {
    setMsg({ ok: r.ok, text: r.ok ? (r.message ?? "Done.") : (r.error ?? "Failed.") });
    if (r.ok) router.refresh();
  };
  const cls = "rounded-lg border border-brand-navy/15 px-2.5 py-1.5 text-sm outline-none focus:border-brand-primary";
  return (
    <div className="space-y-3 px-5 py-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-brand-navy/55">Plan</label>
        <select value={chosen} onChange={(e) => setChosen(e.target.value)} className={cls}>
          {PLANS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <button type="button" disabled={pending || chosen === plan} onClick={() => window.confirm(`Move this customer to the ${chosen} plan? They get a fresh monthly allowance now.`) && start(async () => done(await setUserPlan(userId, chosen)))} className="rounded-full bg-brand-primary px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-40">
          Change plan
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-brand-navy/55">Add</label>
        <input type="number" min={1} max={20000} value={amount} onChange={(e) => setAmount(e.target.value)} className={`${cls} w-24`} />
        <span className="text-xs text-brand-navy/55">credits as</span>
        <select value={kind} onChange={(e) => setKind(e.target.value as "TOPUP" | "GRANT")} className={cls}>
          <option value="TOPUP">a paid top-up</option>
          <option value="GRANT">a goodwill grant</option>
        </select>
        <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="Why (kept in the history)" className={`${cls} min-w-[12rem] flex-1`} />
        <button type="button" disabled={pending || !amount} onClick={() => start(async () => done(await grantUserCredits(userId, Number(amount), kind, reason)))} className="rounded-full border border-brand-primary px-4 py-1.5 text-xs font-semibold text-brand-primary disabled:opacity-40">
          Add credits
        </button>
      </div>
      {msg && <p className={`text-xs ${msg.ok ? "text-[#0b6b30]" : "text-brand-sell"}`}>{msg.text}</p>}
    </div>
  );
}
