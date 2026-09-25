"use client";

import { useEffect, useState } from "react";
import { MessageSquareText } from "lucide-react";
import { usePathname } from "next/navigation";
import { submitFeedbackAction } from "@/lib/feedback-actions";
import BodyPortal from "@/components/ui/body-portal";

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

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      setStatus("idle");
      setError(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-full bg-brand-primary-light px-4 py-2.5 text-sm font-semibold text-white ring-1 ring-white/15 transition-colors hover:bg-brand-primary"
      >
        <MessageSquareText size={15} />
        Feedback
      </button>

      {open && (
        // Rendered at <body> level: inside the sidebar (backdrop-filter) a fixed overlay
        // would be sized to the sidebar, get clipped and let the page (e.g. charts) show through.
        <BodyPortal>
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-brand-navy/30 p-4 backdrop-blur-[2px] sm:items-center" onClick={close}>
          <div role="dialog" aria-modal="true" aria-label="Send feedback" onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
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
                  autoFocus
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={4}
                  placeholder="What's working, what's not, what would help..."
                  className="mt-3 w-full resize-none rounded-lg border border-brand-navy/15 px-3 py-2 text-sm text-brand-navy outline-none placeholder:text-brand-navy/40 focus:border-brand-primary focus:shadow-[0_0_0_3px_rgba(71,24,152,0.1)]"
                />
                {error && <p className="mt-2 text-xs text-brand-sell">{error}</p>}
                <div className="mt-3 flex justify-end gap-2">
                  <button type="button" onClick={close} className="rounded-full px-4 py-1.5 text-xs font-semibold text-brand-navy/60">
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={status === "submitting" || !message.trim()}
                    className="rounded-full bg-brand-primary px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {status === "submitting" ? "Sending…" : "Send"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
        </BodyPortal>
      )}
    </>
  );
}
