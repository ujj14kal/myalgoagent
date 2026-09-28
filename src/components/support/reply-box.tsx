"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Send } from "lucide-react";
import { markMySupportThreadSolved, replyToMySupportThread } from "@/lib/support-actions";

/** The user's reply box under one of their support conversations. */
export default function SupportReplyBox({ kind, id, resolved }: { kind: "case" | "feedback"; id: string; resolved: boolean }) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <div className="mt-4 space-y-2">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        maxLength={5000}
        placeholder={resolved ? "Still need help? Write here to reopen this conversation." : "Write a reply to our team…"}
        className="w-full resize-y rounded-xl border border-black/10 bg-white px-3.5 py-2.5 text-sm text-brand-navy outline-none focus:border-brand-primary/50 focus:ring-2 focus:ring-brand-primary/15"
      />
      {error && <p className="text-xs font-medium text-brand-sell">{error}</p>}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {!resolved && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await markMySupportThreadSolved(kind, id);
                if (!r.ok) setError(r.error);
                else router.refresh();
              })
            }
            className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold text-brand-navy/60 ring-1 ring-black/10 hover:bg-brand-bg disabled:opacity-50"
          >
            <CheckCircle2 size={14} /> Mark as solved
          </button>
        )}
        <button
          type="button"
          disabled={pending || !body.trim()}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await replyToMySupportThread(kind, id, body);
              if (!r.ok) return setError(r.error);
              setBody("");
              router.refresh();
            })
          }
          className="inline-flex items-center gap-1.5 rounded-full bg-brand-primary px-4 py-2 text-xs font-semibold text-white hover:bg-brand-primary-light disabled:opacity-50"
        >
          <Send size={13} /> {pending ? "Sending…" : "Send reply"}
        </button>
      </div>
    </div>
  );
}
