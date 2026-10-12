"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { previewOutreach, sendOutreach } from "@/lib/admin/outreach-actions";

type Sender = { address: string; name: string };
const OTHER = "__other__";

export default function OutreachForm({ senders }: { senders: Sender[] }) {
  const [choice, setChoice] = useState(senders[0]?.address ?? OTHER);
  const [custom, setCustom] = useState("");
  const [signName, setSignName] = useState("");
  const [senderRole, setSenderRole] = useState("");
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [html, setHtml] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const input = "mt-1 w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-sm outline-none focus:border-brand-primary/40";
  const from = choice === OTHER ? custom.trim().toLowerCase() : choice;
  const shownAs = senders.find((s) => s.address === from)?.name ?? "MyAlgoAgent";
  const data = { from, signName, senderRole, to, subject, body };

  function preview() {
    start(async () => {
      const r = await previewOutreach(data);
      if (r.ok) { setHtml(r.html ?? null); setFlash(null); } else setFlash({ ok: false, text: r.error });
    });
  }
  function send(testToMe: boolean) {
    if (!testToMe && !window.confirm(`Send this to ${to.trim() || "the recipients"} as ${shownAs} <${from}>?`)) return;
    start(async () => {
      const r = await sendOutreach(data, testToMe);
      setFlash({ ok: r.ok, text: r.ok ? r.message : r.error });
      if (r.ok && !testToMe) { setTo(""); router.refresh(); }
    });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-3">
        <label className="block text-xs font-semibold text-brand-navy/55">
          Send from
          <select className={input} value={choice} onChange={(e) => setChoice(e.target.value)}>
            {senders.map((s) => <option key={s.address} value={s.address}>{s.name} — {s.address}</option>)}
            <option value={OTHER}>Another address on myalgoagent.com…</option>
          </select>
        </label>
        {choice === OTHER && (
          <label className="block text-xs font-semibold text-brand-navy/55">
            Address
            <input className={input} value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="name@myalgoagent.com" />
          </label>
        )}
        <p className="text-[11px] text-brand-navy/45">They will see it from <strong>{shownAs}</strong> &lt;{from || "…"}&gt;. Replies come back to that address.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-semibold text-brand-navy/55">
            Name at the bottom of the message
            <input className={input} value={signName} onChange={(e) => setSignName(e.target.value)} maxLength={60} placeholder="Ujjwal (or leave empty)" />
          </label>
          <label className="block text-xs font-semibold text-brand-navy/55">
            Role under it (optional)
            <input className={input} value={senderRole} onChange={(e) => setSenderRole(e.target.value)} maxLength={80} placeholder="Founder" />
          </label>
        </div>
        <label className="block text-xs font-semibold text-brand-navy/55">
          To (up to 5, separated by commas or lines)
          <textarea className={input} rows={2} value={to} onChange={(e) => setTo(e.target.value)} placeholder="creator@example.com" />
        </label>
        <label className="block text-xs font-semibold text-brand-navy/55">
          Subject
          <input className={input} value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={150} placeholder="Collaboration idea for your channel" />
        </label>
        <label className="block text-xs font-semibold text-brand-navy/55">
          Message — just the text, we do the formatting
          <textarea className={input} rows={10} value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} placeholder={"Hi Rahul,\n\nI watch your videos on…"} />
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={pending} onClick={preview} className="rounded-xl border border-black/10 px-4 py-2 text-sm font-semibold text-brand-navy hover:bg-black/[0.03] disabled:opacity-50">Preview</button>
          <button type="button" disabled={pending} onClick={() => send(true)} className="rounded-xl border border-brand-primary/30 px-4 py-2 text-sm font-semibold text-brand-primary hover:bg-brand-primary/5 disabled:opacity-50">Send a test to me</button>
          <button type="button" disabled={pending} onClick={() => send(false)} className="rounded-xl bg-brand-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">{pending ? "Working…" : "Send"}</button>
        </div>
        {flash && <p className={`text-sm ${flash.ok ? "text-brand-buy" : "text-brand-sell"}`}>{flash.text}</p>}
        <p className="text-[11px] text-brand-navy/40">Sent one by one through Google Workspace as a personal message, with a line telling people they can reply &ldquo;no thanks&rdquo;. Not for bulk mail.</p>
      </div>
      <div>
        <p className="mb-1 text-xs font-semibold text-brand-navy/55">How it will look</p>
        {html ? (
          <iframe title="Email preview" srcDoc={html} sandbox="" className="h-[640px] w-full rounded-xl border border-black/[0.08] bg-white" />
        ) : (
          <div className="flex h-[640px] items-center justify-center rounded-xl border border-dashed border-black/10 px-6 text-center text-sm text-brand-navy/40">Press Preview to see the finished email.</div>
        )}
      </div>
    </div>
  );
}
