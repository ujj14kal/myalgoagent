"use client";

import { useState } from "react";
import { submitSupportCaseAction } from "@/lib/feedback-actions";

type Step = "form" | "confirm-email" | "success";

export default function SupportForm({ initialEmail }: { initialEmail: string }) {
  const [step, setStep] = useState<Step>("form");
  const [email, setEmail] = useState(initialEmail);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [caseId, setCaseId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStep("confirm-email");
  }

  async function handleConfirm() {
    setError(null);
    setSubmitting(true);
    const result = await submitSupportCaseAction({ email, subject, message });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      setStep("form");
      return;
    }
    setCaseId(result.caseId);
    setStep("success");
  }

  if (step === "success" && caseId) {
    return (
      <div className="rounded-2xl border border-brand-buy/30 bg-brand-buy/5 p-6 text-center">
        <p className="text-sm font-semibold text-brand-navy">Request submitted</p>
        <p className="mt-2 text-sm text-brand-navy/70">
          Your case ID is <strong>{caseId}</strong>. Our support team will
          reach out to <strong>{email}</strong> within 2–3 days.
        </p>
      </div>
    );
  }

  if (step === "confirm-email") {
    return (
      <div className="rounded-2xl border border-brand-gold/40 bg-brand-gold/10 p-6 text-center">
        <p className="text-sm font-semibold text-brand-navy">Is this the right email?</p>
        <p className="mt-2 text-lg font-semibold text-brand-primary">{email}</p>
        <p className="mt-1 text-xs text-brand-navy/60">We&rsquo;ll send your case ID and updates here.</p>
        <div className="mt-4 flex justify-center gap-3">
          <button
            type="button"
            onClick={() => setStep("form")}
            className="rounded-full border border-brand-navy/15 px-5 py-2 text-sm font-semibold text-brand-navy"
          >
            Go back and edit
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting}
            className="rounded-full bg-brand-primary px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {submitting ? "Submitting…" : "Yes, that's correct"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleFormSubmit} className="space-y-4 rounded-2xl border border-black/5 bg-white p-6">
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-navy/40">Your email</label>
        <input
          required
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-brand-navy/15 px-3 py-2 text-sm outline-none focus:border-brand-primary"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-navy/40">Subject</label>
        <input
          required
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="w-full rounded-lg border border-brand-navy/15 px-3 py-2 text-sm outline-none focus:border-brand-primary"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-navy/40">Message</label>
        <textarea
          required
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="w-full rounded-lg border border-brand-navy/15 px-3 py-2 text-sm outline-none focus:border-brand-primary"
        />
      </div>
      {error && <p className="text-sm text-brand-sell">{error}</p>}
      <button
        type="submit"
        className="rounded-full bg-brand-primary px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-primary-light"
      >
        Send
      </button>
    </form>
  );
}
