"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";

/** "Request a refund": a short reason, then it goes to our team. Nothing is refunded until a person decides. */
export default function RefundRequestButton({ paymentId, amountLabel }: { paymentId: string; amountLabel: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/refund-request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paymentId, reason }) });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; ref?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? "Something went wrong. Please try again.");
      setSent(j.ref ?? "sent");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) return <span className="text-xs font-semibold text-[#0b6b30]">Request sent{sent !== "sent" ? ` (${sent})` : ""}</span>;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-xs font-semibold text-brand-primary underline-offset-2 hover:underline">
        Request refund
      </button>
      {open && (
        <div role="dialog" aria-modal="true" aria-label="Request a refund" className="fixed inset-0 z-[90] flex items-center justify-center bg-brand-navy/60 p-4 backdrop-blur-sm" onClick={(e) => e.target === e.currentTarget && !busy && setOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-brand-navy">Request a refund</h2>
            <p className="mt-1 text-sm text-brand-navy/65">For your payment of <strong>{amountLabel}</strong>. Tell us briefly what went wrong; our team looks at every request and emails you the decision, usually within 3 working days.</p>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={4} maxLength={600} autoFocus placeholder="For example: I was charged twice, or I upgraded by mistake." className="mt-4 w-full rounded-xl border border-black/15 px-3 py-2 text-sm outline-none focus:border-brand-primary" />
            {error && <p role="alert" className="mt-2 text-xs text-[#9b1111]">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" disabled={busy} onClick={() => setOpen(false)} className="rounded-full px-4 py-2 text-sm font-semibold text-brand-navy/70 hover:bg-black/[0.04] disabled:opacity-50">
                Cancel
              </button>
              <button type="button" disabled={busy || reason.trim().length < 8} onClick={send} className="inline-flex items-center gap-2 rounded-full bg-brand-primary px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-primary-light disabled:opacity-50">
                {busy && <Loader2 size={14} className="animate-spin" />} Send request
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
