"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { submitFeedbackAction } from "@/lib/feedback-actions";

export default function FeedbackWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus("submitting");
    const result = await submitFeedbackAction(pathname, message);
    if (!result.ok) {
      setStatus("error");
      setError(result.error);
      return;
    }
    setStatus("sent");
    setMessage("");
  }

  function close() {
    setOpen(false);
    setStatus("idle");
    setError(null);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 rounded-full bg-brand-primary px-4 py-2.5 text-xs font-semibold text-white shadow-lg hover:bg-brand-primary-light"
      >
        Feedback
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-end bg-black/20 p-6 sm:items-center sm:justify-center">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            {status === "sent" ? (
              <>
                <p className="text-sm font-semibold text-brand-navy">Thanks for the feedback!</p>
                <p className="mt-1 text-xs text-brand-navy/60">We read every submission.</p>
                <button
                  type="button"
                  onClick={close}
                  className="mt-4 rounded-full border border-brand-navy/15 px-4 py-1.5 text-xs font-semibold text-brand-navy"
                >
                  Close
                </button>
              </>
            ) : (
              <form onSubmit={handleSubmit}>
                <p className="text-sm font-semibold text-brand-navy">Send feedback</p>
                <p className="mt-1 text-xs text-brand-navy/50">About this page: {pathname}</p>
                <textarea
                  required
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={4}
                  placeholder="What's working, what's not, what would help..."
                  className="mt-3 w-full rounded-lg border border-brand-navy/15 px-3 py-2 text-sm outline-none focus:border-brand-primary"
                />
                {error && <p className="mt-2 text-xs text-brand-sell">{error}</p>}
                <div className="mt-3 flex justify-end gap-2">
                  <button type="button" onClick={close} className="rounded-full px-4 py-1.5 text-xs font-semibold text-brand-navy/60">
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={status === "submitting"}
                    className="rounded-full bg-brand-primary px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {status === "submitting" ? "Sending…" : "Send"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
