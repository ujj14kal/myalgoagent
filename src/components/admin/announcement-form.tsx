"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Megaphone } from "lucide-react";
import { createAnnouncement } from "@/lib/admin/actions";
import AnnouncementBanner from "@/components/announcement-banner";

type Level = "INFO" | "SUCCESS" | "WARNING" | "CRITICAL";

export default function AnnouncementForm() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [level, setLevel] = useState<Level>("INFO");
  const [link, setLink] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [notify, setNotify] = useState(false);
  const [email, setEmail] = useState(false);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const input = "mt-1 w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-sm outline-none focus:border-brand-primary/40";

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
        <label className="block text-xs font-semibold text-brand-navy/55">
          Title
          <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Scheduled maintenance tonight" />
        </label>
        <label className="block text-xs font-semibold text-brand-navy/55">
          Level
          <select className={input} value={level} onChange={(e) => setLevel(e.target.value as Level)}>
            <option value="INFO">Info (blue)</option>
            <option value="SUCCESS">Good news (green)</option>
            <option value="WARNING">Warning (gold)</option>
            <option value="CRITICAL">Critical (red, can&apos;t dismiss)</option>
          </select>
        </label>
      </div>
      <label className="block text-xs font-semibold text-brand-navy/55">
        Message
        <textarea className={input} rows={3} value={body} onChange={(e) => setBody(e.target.value)} maxLength={1000} placeholder="MyAlgoAgent will be unavailable from 11:30 PM to 12:00 AM IST while we upgrade our systems." />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-brand-navy/55">
          Link (optional)
          <input className={input} value={link} onChange={(e) => setLink(e.target.value)} placeholder="/app/broker-connections" />
        </label>
        <label className="block text-xs font-semibold text-brand-navy/55">
          Take down automatically at (optional)
          <input type="datetime-local" className={input} value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
        </label>
      </div>
      <div className="flex flex-wrap gap-4 text-sm text-brand-navy/75">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="accent-[var(--brand-primary)]" /> Also send as a notification to everyone
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} className="accent-[var(--brand-primary)]" /> Also email everyone <span className="text-xs text-brand-navy/45">(service notices only — never marketing)</span>
        </label>
      </div>

      {(title || body) && (
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-brand-navy/40">Preview</p>
          <div className="-mx-4 md:-mx-6 lg:-mx-8">
            <AnnouncementBanner id="preview" title={title || "Title"} body={body || "Message"} level={level} link={link || null} />
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={pending || !title.trim() || !body.trim()}
          onClick={() => {
            if (email && !window.confirm("Email every active user? Use this only for important service notices.")) return;
            start(async () => {
              const r = await createAnnouncement({ title, body, level, link, endsAt: endsAt ? new Date(endsAt).toISOString() : undefined, notify, email });
              setFlash(r.ok ? { ok: true, text: r.message ?? "Published." } : { ok: false, text: r.error });
              if (r.ok) {
                setTitle("");
                setBody("");
                setLink("");
                setEndsAt("");
                setNotify(false);
                setEmail(false);
                router.refresh();
              }
            });
          }}
          className="inline-flex items-center gap-1.5 rounded-full bg-brand-primary px-4 py-2 text-xs font-semibold text-white hover:bg-brand-primary-light disabled:opacity-40"
        >
          <Megaphone size={13} /> {pending ? "Publishing…" : "Publish"}
        </button>
        {flash && <p className={`text-xs font-medium ${flash.ok ? "text-[#0b6b30]" : "text-brand-sell"}`}>{flash.text}</p>}
      </div>
    </div>
  );
}
