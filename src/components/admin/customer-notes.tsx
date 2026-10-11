"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Undo2 } from "lucide-react";
import { addCustomerNote, setNoteDone } from "@/lib/admin/actions";

export type NoteRow = { id: string; body: string; authorEmail: string; createdAt: string; followUpAt: string | null; doneAt: string | null };

const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

/** The team's notes on one customer, with follow-ups that can be ticked off. */
export default function CustomerNotes({ userId, notes, now }: { userId: string; notes: NoteRow[]; /** Epoch ms of the render, so "overdue" is judged on the server's clock. */ now: number }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [follow, setFollow] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div>
      <div className="space-y-2 px-5 py-4">
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} maxLength={1500} placeholder="What should the next person know? e.g. Asked about Dhan data plan; promised a call." className="w-full rounded-lg border border-brand-navy/15 px-3 py-2 text-sm outline-none focus:border-brand-primary" />
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-brand-navy/60">
            Follow up on
            <input type="date" value={follow} onChange={(e) => setFollow(e.target.value)} className="rounded-lg border border-brand-navy/15 px-2 py-1 text-xs" />
          </label>
          <button
            type="button"
            disabled={pending || !body.trim()}
            onClick={() =>
              start(async () => {
                const r = await addCustomerNote(userId, body, follow || null);
                setMsg({ ok: r.ok, text: r.ok ? (r.message ?? "Saved.") : r.error });
                if (r.ok) {
                  setBody("");
                  setFollow("");
                  router.refresh();
                }
              })
            }
            className="rounded-full bg-brand-primary px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
          >
            {pending ? "Saving…" : "Add note"}
          </button>
          {msg && <span className={`text-xs ${msg.ok ? "text-[#0b6b30]" : "text-brand-sell"}`}>{msg.text}</span>}
        </div>
      </div>
      {notes.length === 0 ? (
        <p className="border-t border-black/[0.05] px-5 py-4 text-sm text-brand-navy/45">No notes yet.</p>
      ) : (
        <ul className="divide-y divide-black/[0.04] border-t border-black/[0.05]">
          {notes.map((n) => {
            const overdue = n.followUpAt && !n.doneAt && new Date(n.followUpAt).getTime() < now;
            return (
              <li key={n.id} className="flex items-start gap-3 px-5 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="whitespace-pre-wrap break-words text-brand-navy">{n.body}</p>
                  <p className="mt-0.5 text-xs text-brand-navy/45">
                    {n.authorEmail} · {day(n.createdAt)}
                    {n.followUpAt && (
                      <span className={`ml-2 font-semibold ${n.doneAt ? "text-[#0b6b30]" : overdue ? "text-brand-sell" : "text-[#6f5a22]"}`}>
                        {n.doneAt ? `Follow-up done ${day(n.doneAt)}` : `${overdue ? "Overdue: " : "Follow up "}${day(n.followUpAt)}`}
                      </span>
                    )}
                  </p>
                </div>
                {n.followUpAt && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => start(async () => { await setNoteDone(n.id, !n.doneAt); router.refresh(); })}
                    title={n.doneAt ? "Reopen" : "Mark done"}
                    className="shrink-0 rounded-full p-1.5 text-brand-navy/45 ring-1 ring-black/10 hover:text-brand-primary disabled:opacity-40"
                  >
                    {n.doneAt ? <Undo2 size={13} /> : <Check size={13} />}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
