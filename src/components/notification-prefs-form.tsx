"use client";

import { useState } from "react";
import { setNotificationPrefsAction, type NotificationPrefs } from "@/lib/agent-actions";

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description: string;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-2">
      <span>
        <span className="block text-sm font-medium text-brand-navy">{label}</span>
        <span className="block text-xs text-brand-navy/50">{description}</span>
      </span>
      <span className="mt-0.5 shrink-0">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
        <span
          onClick={() => onChange(!checked)}
          className={`block h-6 w-11 rounded-full transition-colors ${checked ? "bg-brand-primary" : "bg-brand-navy/15"}`}
        >
          <span
            className={`block h-5 w-5 translate-y-0.5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-[22px]" : "translate-x-0.5"}`}
          />
        </span>
      </span>
    </label>
  );
}

export default function NotificationPrefsForm({ initial }: { initial: NotificationPrefs }) {
  const [prefs, setPrefs] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  async function update(next: NotificationPrefs) {
    setPrefs(next);
    setSaving(true);
    setMessage(null);
    const result = await setNotificationPrefsAction(next);
    setSaving(false);
    setMessage(result.ok ? { type: "ok", text: "Saved." } : { type: "error", text: result.error });
  }

  return (
    <div>
      <div className="divide-y divide-black/5">
        <Toggle
          checked={prefs.notifyOrderFilled}
          onChange={(v) => update({ ...prefs, notifyOrderFilled: v })}
          label="Order fills"
          description="Notify when a paper or webhook order actually executes."
        />
        <Toggle
          checked={prefs.notifySignalAlert}
          onChange={(v) => update({ ...prefs, notifySignalAlert: v })}
          label="Signal alerts"
          description="Notify when an alert-only strategy's entry/exit condition fires."
        />
      </div>
      <p className="mt-3 text-xs text-brand-navy/40">
        Risk-limit and kill-switch notifications can&rsquo;t be turned off — those always reach you.
      </p>
      {saving && <p className="mt-2 text-xs text-brand-navy/40">Saving…</p>}
      {!saving && message && (
        <p className={`mt-2 text-xs ${message.type === "ok" ? "text-brand-buy" : "text-brand-sell"}`}>{message.text}</p>
      )}
    </div>
  );
}
