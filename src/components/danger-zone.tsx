"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { requestAccountDeletionAction } from "@/lib/deletion-actions";

const CONFIRMATION_PHRASE = "delete-my-account";

export default function DangerZone() {
  const router = useRouter();
  const [confirmationText, setConfirmationText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const matches = confirmationText.trim() === CONFIRMATION_PHRASE;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = await requestAccountDeletionAction(confirmationText);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push("/app/account/delete/verify");
  }

  return (
    <div className="rounded-2xl border border-brand-sell/30 bg-brand-sell/5 p-6">
      <h2 className="text-sm font-semibold text-brand-sell">Delete account</h2>
      <p className="mt-2 text-sm text-brand-navy/70">
        This permanently deletes your account, strategies, backtests, paper
        sessions and all related data. Your account enters a 15-day
        reversible window first — logging back in during that window
        automatically cancels the deletion. After 15 days it is permanent
        and cannot be undone.
      </p>
      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-navy/40">
            Type <code className="rounded bg-black/5 px-1">{CONFIRMATION_PHRASE}</code> to continue
          </label>
          <input
            value={confirmationText}
            onChange={(e) => setConfirmationText(e.target.value)}
            className="w-full rounded-lg border border-brand-navy/15 px-3 py-2 text-sm outline-none focus:border-brand-sell"
          />
        </div>
        {error && <p className="text-sm text-brand-sell">{error}</p>}
        <button
          type="submit"
          disabled={!matches || submitting}
          className="rounded-full bg-brand-sell px-5 py-2 text-sm font-semibold text-white hover:bg-brand-sell/90 disabled:opacity-40"
        >
          {submitting ? "Sending code…" : "Continue"}
        </button>
      </form>
    </div>
  );
}
