"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveRefund, declineRefund } from "@/lib/admin/refund-actions";

/** One refund decision: how much, what happens to the account, a note; then refund through Razorpay or decline. */
export default function RefundForm({ paymentId, requestId, paidRupees, kind }: { paymentId: string; requestId: string | null; paidRupees: string; kind: "subscription" | "topup" }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [amount, setAmount] = useState(paidRupees);
  const [cancelPlan, setCancelPlan] = useState(kind === "subscription");
  const [takeBack, setTakeBack] = useState(kind === "topup");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function run(fn: () => Promise<{ ok: boolean; message?: string; error?: string }>, confirmText: string) {
    if (!window.confirm(confirmText)) return;
    setMsg(null);
    start(async () => {
      const r = await fn();
      setMsg({ ok: r.ok, text: (r.ok ? r.message : r.error) ?? "" });
      if (r.ok) router.refresh();
    });
  }

  return (
    <div className="mt-3 space-y-3 rounded-xl bg-[#f6f3fc] p-3 text-sm">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-semibold text-brand-navy/70">
          Refund (₹)
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className="mt-1 block w-32 rounded-lg border border-black/10 bg-white px-3 py-1.5 text-sm tabular-nums" />
        </label>
        <p className="pb-1.5 text-xs text-brand-navy/50">Paid ₹{paidRupees}. Less than that is a partial refund.</p>
      </div>
      {kind === "subscription" && (
        <label className="flex items-center gap-2 text-xs text-brand-navy/80">
          <input type="checkbox" checked={cancelPlan} onChange={(e) => setCancelPlan(e.target.checked)} /> Also cancel the plan now (the account moves to Free and renewals stop)
        </label>
      )}
      {kind === "topup" && (
        <label className="flex items-center gap-2 text-xs text-brand-navy/80">
          <input type="checkbox" checked={takeBack} onChange={(e) => setTakeBack(e.target.checked)} /> Also take the top-up credits back (never more than they still have)
        </label>
      )}
      <label className="block text-xs font-semibold text-brand-navy/70">
        Note (shown to the customer if you decline; kept on the record if you refund)
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={300} className="mt-1 block w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm" />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => approveRefund({ paymentId, requestId, amount, cancelPlan, takeBackCredits: takeBack, note }), `Refund ₹${amount} through Razorpay now? This sends the money back to the customer and cannot be undone.`)}
          className="rounded-full bg-brand-primary px-4 py-2 text-xs font-semibold text-white transition hover:bg-brand-primary-light disabled:opacity-50"
        >
          {pending ? "Working…" : "Refund via Razorpay"}
        </button>
        {requestId && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => declineRefund({ requestId, note }), "Decline this request and tell the customer?")}
            className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-brand-navy ring-1 ring-black/15 transition hover:bg-black/[0.03] disabled:opacity-50"
          >
            Decline
          </button>
        )}
      </div>
      {msg && <p role="status" className={`text-xs ${msg.ok ? "font-semibold text-[#0b6b30]" : "text-[#9b1111]"}`}>{msg.text}</p>}
    </div>
  );
}
