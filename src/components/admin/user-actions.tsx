"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, Download, LogOut, Mail, RotateCcw, Trash2, Undo2 } from "lucide-react";
import { cancelUserDeletion, messageUser, scheduleUserDeletion, signOutUserEverywhere, suspendUser, unsuspendUser, type AdminResult } from "@/lib/admin/actions";

type Panel = null | "message" | "suspend" | "delete";

/** Actions on one account. Destructive ones ask for a reason (kept in the audit log). */
export default function UserActions({ userId, status, canManage, isSelf, protectedOwner }: { userId: string; status: "ACTIVE" | "SUSPENDED" | "PENDING_DELETION"; canManage: boolean; isSelf: boolean; protectedOwner: boolean }) {
  const [panel, setPanel] = useState<Panel>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [email, setEmail] = useState(true);
  const [reason, setReason] = useState("");
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const act = (fn: () => Promise<AdminResult>, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    start(async () => {
      setFlash(null);
      const r = await fn();
      setFlash(r.ok ? { ok: true, text: r.message ?? "Done." } : { ok: false, text: r.error });
      if (r.ok) {
        setPanel(null);
        setReason("");
        setSubject("");
        setBody("");
        router.refresh();
      }
    });
  };
  const btn = "inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold ring-1 transition-colors disabled:opacity-40";
  const input = "w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-sm outline-none focus:border-brand-primary/40";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" className={`${btn} bg-brand-primary text-white ring-brand-primary hover:bg-brand-primary-light`} onClick={() => setPanel(panel === "message" ? null : "message")}>
          <Mail size={13} /> Message
        </button>
        {canManage && (
          <>
            <a href={`/admin/users/${userId}/export`} className={`${btn} bg-white text-brand-navy/70 ring-black/10 hover:text-brand-navy`}>
              <Download size={13} /> Export data
            </a>
            <button type="button" disabled={pending || isSelf} className={`${btn} bg-white text-brand-navy/70 ring-black/10 hover:text-brand-navy`} onClick={() => act(() => signOutUserEverywhere(userId), "Sign this user out on every device?")}>
              <LogOut size={13} /> Sign out everywhere
            </button>
            {status === "SUSPENDED" ? (
              <button type="button" disabled={pending} className={`${btn} bg-brand-buy/10 text-[#0b6b30] ring-brand-buy/30`} onClick={() => act(() => unsuspendUser(userId), "Restore this account?")}>
                <RotateCcw size={13} /> Restore account
              </button>
            ) : (
              <button type="button" disabled={pending || isSelf || protectedOwner} className={`${btn} bg-white text-brand-sell ring-brand-sell/30 hover:bg-brand-sell/5`} onClick={() => setPanel(panel === "suspend" ? null : "suspend")}>
                <Ban size={13} /> Suspend
              </button>
            )}
            {status === "PENDING_DELETION" ? (
              <button type="button" disabled={pending} className={`${btn} bg-white text-brand-navy/70 ring-black/10`} onClick={() => act(() => cancelUserDeletion(userId), "Cancel the scheduled deletion?")}>
                <Undo2 size={13} /> Cancel deletion
              </button>
            ) : (
              <button type="button" disabled={pending || isSelf || protectedOwner} className={`${btn} bg-white text-brand-sell ring-brand-sell/30 hover:bg-brand-sell/5`} onClick={() => setPanel(panel === "delete" ? null : "delete")}>
                <Trash2 size={13} /> Schedule deletion
              </button>
            )}
          </>
        )}
      </div>

      {panel === "message" && (
        <div className="space-y-2 rounded-2xl bg-brand-bg/70 p-4 ring-1 ring-black/[0.05]">
          <p className="text-xs text-brand-navy/55">Starts a conversation on their Help &amp; Support page (they can reply), and emails it.</p>
          <input className={input} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" maxLength={200} />
          <textarea className={input} rows={5} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Message" maxLength={5000} />
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-brand-navy/70">
              <input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} className="accent-[var(--brand-primary)]" /> Also email it
            </label>
            <button type="button" disabled={pending || !subject.trim() || !body.trim()} className={`${btn} ml-auto bg-brand-primary text-white ring-brand-primary`} onClick={() => act(() => messageUser(userId, subject, body, { email }))}>
              <Mail size={13} /> {pending ? "Sending…" : "Send"}
            </button>
          </div>
        </div>
      )}
      {(panel === "suspend" || panel === "delete") && (
        <div className="space-y-2 rounded-2xl bg-brand-sell/[0.04] p-4 ring-1 ring-brand-sell/20">
          <p className="text-xs text-brand-navy/65">
            {panel === "suspend"
              ? "Suspending signs them out everywhere, blocks sign-in, and pauses their live forward tests. Their data is kept. You can restore it any time."
              : "Schedules permanent deletion in 15 days (the same window as a self-service request) and signs them out. Signing back in before then cancels it. Use this only when the user asked for deletion."}
          </p>
          <input className={input} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={panel === "suspend" ? "Reason (kept on the account and in the audit log)" : "Why — e.g. “user asked by email, case MAA-100012”"} maxLength={300} />
          <button
            type="button"
            disabled={pending || !reason.trim()}
            className={`${btn} bg-brand-sell text-white ring-brand-sell`}
            onClick={() => act(() => (panel === "suspend" ? suspendUser(userId, reason) : scheduleUserDeletion(userId, reason)))}
          >
            {panel === "suspend" ? <Ban size={13} /> : <Trash2 size={13} />}
            {pending ? "Working…" : panel === "suspend" ? "Suspend account" : "Schedule deletion"}
          </button>
        </div>
      )}
      {flash && <p className={`text-xs font-medium ${flash.ok ? "text-[#0b6b30]" : "text-brand-sell"}`}>{flash.text}</p>}
    </div>
  );
}
