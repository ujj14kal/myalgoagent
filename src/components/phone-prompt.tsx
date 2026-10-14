"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Phone } from "lucide-react";
import { savePhoneAction } from "@/lib/profile-actions";

/** Shown once to an account with no mobile number (Google and email-link sign-ups don't ask for one), until it is added. */
export default function PhonePrompt() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    start(async () => {
      const r = await savePhoneAction({ phone });
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  };
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-brand-navy/40 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="phone-prompt-title">
      <form onSubmit={submit} className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-primary/10 text-brand-primary">
          <Phone size={20} />
        </span>
        <h2 id="phone-prompt-title" className="mt-3 text-lg font-bold text-brand-navy">Add your mobile number</h2>
        <p className="mt-1 text-sm text-brand-navy/60">So our team can reach you quickly if something needs your attention on your account. We don&apos;t send marketing messages.</p>
        <label className="mb-1 mt-4 block text-xs font-semibold uppercase tracking-wide text-brand-navy/40" htmlFor="phone-prompt-input">Mobile number</label>
        <input
          id="phone-prompt-input"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          autoFocus
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="98765 43210"
          className="w-full rounded-xl border border-brand-navy/15 px-3 py-2.5 text-sm outline-none focus:border-brand-primary"
        />
        {error && <p role="alert" className="mt-2 text-xs text-brand-sell">{error}</p>}
        <button type="submit" disabled={pending || !phone.trim()} className="mt-4 w-full rounded-full bg-brand-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-primary-light disabled:opacity-50">
          {pending ? "Saving…" : "Save and continue"}
        </button>
      </form>
    </div>
  );
}
