"use client";

import { useState } from "react";
import { requestPasswordResetAction } from "@/lib/account-actions";

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    await requestPasswordResetAction(email);
    setSubmitting(false);
    setSent(true);
  }

  if (sent) {
    return (
      <p className="mt-8 text-sm text-brand-navy/70">
        If an account exists for <strong>{email}</strong>, a password reset
        link has been sent. Check your inbox.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 w-full space-y-4 text-left">
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-navy/40">Email</label>
        <input
          required
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-brand-navy/15 px-3 py-2 text-sm outline-none focus:border-brand-primary"
        />
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-full bg-brand-primary px-6 py-3 text-sm font-semibold text-white hover:bg-brand-primary-light disabled:opacity-50"
      >
        {submitting ? "Sending…" : "Send reset link"}
      </button>
    </form>
  );
}
