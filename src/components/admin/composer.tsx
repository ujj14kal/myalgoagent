"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock, Send, Sparkles } from "lucide-react";
import { addTicketNote, replyToTicket } from "@/lib/admin/actions";
import { CANNED_REPLIES } from "@/lib/admin/canned";

type Status = "OPEN" | "PENDING" | "RESOLVED";

/** Reply to the user (in-app + email) or leave an internal note. */
export default function Composer({ kind, id, firstName, canEmail }: { kind: "case" | "feedback"; id: string; firstName: string; canEmail: boolean }) {
  const [mode, setMode] = useState<"reply" | "note">("reply");
  const [body, setBody] = useState("");
  const [email, setEmail] = useState(true);
  const [after, setAfter] = useState<Status>("PENDING");
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const send = () =>
    start(async () => {
      setFlash(null);
      const r = mode === "reply" ? await replyToTicket(kind, id, body, { email: email && canEmail, status: after }) : await addTicketNote(kind, id, body);
      if (!r.ok) return setFlash({ ok: false, text: r.error });
      setBody("");
      setFlash({ ok: true, text: r.message ?? "Done." });
      router.refresh();
    });

  return (
    <div className={`rounded-2xl p-4 ring-1 ${mode === "note" ? "bg-amber-50/70 ring-amber-200" : "bg-white ring-black/[0.06]"}`}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg bg-brand-navy/[0.05] p-0.5">
          {(["reply", "note"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold ${mode === m ? "bg-white text-brand-navy shadow-sm" : "text-brand-navy/50"}`}
            >
              {m === "reply" ? <Send size={12} /> : <Lock size={12} />}
              {m === "reply" ? "Reply to user" : "Internal note"}
            </button>
          ))}
        </div>
        {mode === "reply" && (
          <select
            aria-label="Insert a ready-made reply"
            value=""
            onChange={(e) => {
              const c = CANNED_REPLIES[Number(e.target.value)];
              if (c) setBody(c.body.replaceAll("{name}", firstName || "there"));
            }}
            className="ml-auto rounded-lg border border-black/[0.08] bg-white px-2 py-1 text-xs text-brand-navy/70"
          >
            <option value="">✨ Ready-made reply…</option>
            {CANNED_REPLIES.map((c, k) => (
              <option key={c.label} value={k}>
                {c.label}
              </option>
            ))}
          </select>
        )}
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && body.trim() && !pending) send();
        }}
        rows={6}
        maxLength={5000}
        placeholder={mode === "reply" ? `Write to ${firstName || "the user"}…  (⌘/Ctrl + Enter to send)` : "Only the team sees notes."}
        className="w-full resize-y rounded-xl border border-black/[0.08] bg-white px-3.5 py-3 text-sm leading-relaxed text-brand-navy outline-none focus:border-brand-primary/40 focus:ring-2 focus:ring-brand-primary/10"
      />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {mode === "reply" && (
          <>
            <label className={`flex items-center gap-1.5 text-xs ${canEmail ? "text-brand-navy/70" : "text-brand-navy/35"}`}>
              <input type="checkbox" checked={email && canEmail} disabled={!canEmail} onChange={(e) => setEmail(e.target.checked)} className="accent-[var(--brand-primary)]" />
              Also email it
            </label>
            <label className="flex items-center gap-1.5 text-xs text-brand-navy/70">
              then mark
              <select value={after} onChange={(e) => setAfter(e.target.value as Status)} className="rounded-lg border border-black/[0.08] bg-white px-2 py-1 text-xs">
                <option value="PENDING">waiting on user</option>
                <option value="RESOLVED">resolved</option>
                <option value="OPEN">still needs reply</option>
              </select>
            </label>
          </>
        )}
        <span className="text-[11px] text-brand-navy/35">{body.length.toLocaleString("en-IN")}/5,000</span>
        <button
          type="button"
          disabled={pending || !body.trim()}
          onClick={send}
          className={`ml-auto inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold text-white disabled:opacity-40 ${mode === "reply" ? "bg-brand-primary hover:bg-brand-primary-light" : "bg-amber-600 hover:bg-amber-500"}`}
        >
          {mode === "reply" ? <Send size={13} /> : <Lock size={13} />}
          {pending ? "Saving…" : mode === "reply" ? "Send reply" : "Add note"}
        </button>
      </div>
      {flash && (
        <p className={`mt-2 flex items-center gap-1.5 text-xs font-medium ${flash.ok ? "text-[#0b6b30]" : "text-brand-sell"}`}>
          {flash.ok && <Sparkles size={12} />} {flash.text}
        </p>
      )}
    </div>
  );
}
