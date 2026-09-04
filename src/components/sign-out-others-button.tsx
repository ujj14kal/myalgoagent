"use client";

import { useState } from "react";
import { signOutOtherSessionsAction } from "@/lib/profile-actions";

export default function SignOutOthersButton() {
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleClick() {
    setSubmitting(true);
    await signOutOtherSessionsAction();
    setSubmitting(false);
    setDone(true);
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={submitting || done}
        className="rounded-full border border-brand-navy/15 px-5 py-2 text-sm font-semibold text-brand-navy hover:border-brand-primary hover:text-brand-primary disabled:opacity-50"
      >
        {done ? "Done" : submitting ? "Signing out other sessions…" : "Sign out of all other sessions"}
      </button>
    </div>
  );
}
