"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { confirmAccountDeletionAction } from "@/lib/deletion-actions";

export default function VerifyDeletionForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = await confirmAccountDeletionAction(code);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDone(true);
    setTimeout(() => {
      router.push("/");
    }, 3000);
  }

  if (done) {
    return (
      <div className="mt-6 text-center">
        <p className="text-sm text-brand-navy/70">
          Your account is scheduled for deletion in 15 days. Log back in
          before then to cancel it automatically. You&rsquo;ve been signed
          out — redirecting you home…
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-3 text-left">
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-navy/40">
          Enter the 6-digit code we emailed you
        </label>
        <input
          required
          value={code}
          onChange={(e) => setCode(e.target.value)}
          maxLength={6}
          className="w-full rounded-lg border border-brand-navy/15 px-3 py-2 text-center text-lg tracking-widest outline-none focus:border-brand-sell"
        />
      </div>
      {error && <p className="text-sm text-brand-sell">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-full bg-brand-sell px-6 py-3 text-sm font-semibold text-white hover:bg-brand-sell/90 disabled:opacity-50"
      >
        {submitting ? "Verifying…" : "Confirm deletion"}
      </button>
    </form>
  );
}
