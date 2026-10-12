"use client";

import { useState } from "react";
import { setEmailPrefsAction } from "@/lib/agent-actions";
import { EVENT_INFO, EVENT_KINDS, wantsEmail, type EmailPrefs, type EventKind } from "@/lib/event-email-config";

export default function EmailPrefsForm({ initial }: { initial: EmailPrefs }) {
  const [prefs, setPrefs] = useState<EmailPrefs>(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function toggle(kind: EventKind, on: boolean) {
    const next = { ...prefs, [kind]: on };
    setPrefs(next);
    setMsg(null);
    const res = await setEmailPrefsAction(next);
    setMsg(res.ok ? { ok: true, text: "Saved." } : { ok: false, text: res.error });
  }

  return (
    <div>
      <div className="divide-y divide-black/5">
        {EVENT_KINDS.map((kind) => {
          const info = EVENT_INFO[kind];
          const on = wantsEmail(prefs, kind);
          return (
            <label key={kind} className={`flex items-start justify-between gap-4 py-2 ${info.alwaysOn ? "" : "cursor-pointer"}`}>
              <span>
                <span className="block text-sm font-medium text-brand-navy">{info.label}</span>
                <span className="block text-xs text-brand-navy/50">{info.description}{info.alwaysOn ? " Always sent." : ""}</span>
              </span>
              <input type="checkbox" checked={on} disabled={info.alwaysOn} onChange={(e) => toggle(kind, e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-[var(--brand-primary)]" />
            </label>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-brand-navy/40">Emails about a paused strategy or an ended broker login are safety alerts and can&rsquo;t be switched off.</p>
      {msg && <p className={`mt-2 text-xs ${msg.ok ? "text-brand-buy" : "text-brand-sell"}`}>{msg.text}</p>}
    </div>
  );
}
