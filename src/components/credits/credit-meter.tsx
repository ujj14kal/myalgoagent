"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Coins, Mic, Sparkles, Wrench } from "lucide-react";
import { useCredits } from "./credits-provider";

/** A number that glides to its new value instead of jumping. */
function useCountTo(target: number) {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    if (a === target) return;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / 550);
      const v = Math.round(a + (target - a) * (1 - Math.pow(1 - k, 3)));
      setShown(v);
      from.current = v;
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return shown;
}

const fmt = (n: number) => n.toLocaleString("en-IN");
const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
const tone = (share: number) => (share > 0.4 ? "bg-brand-buy" : share > 0.15 ? "bg-brand-gold" : "bg-brand-sell");

function Bar({ used, cap, label, icon }: { used: number; cap: number; label: string; icon: React.ReactNode }) {
  if (cap <= 0) return null;
  const left = Math.max(0, 1 - used / cap);
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] text-brand-navy/60">
        <span className="flex items-center gap-1">{icon} {label}</span>
        <span className="num tabular-nums">{used} / {cap} today</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-brand-navy/[0.08]">
        <div className={`h-full rounded-full transition-all duration-500 ${tone(left)}`} style={{ width: `${Math.min(100, (used / cap) * 100)}%` }} />
      </div>
    </div>
  );
}

/** The credits left, always current: a chip in the top bar that opens the details — what is left, what renews and when, and today's limits. */
export default function CreditMeter() {
  const { snap } = useCredits();
  const total = useCountTo(snap.total);
  const [open, setOpen] = useState(false);
  const [delta, setDelta] = useState<number | null>(null);
  const last = useRef(snap.total);
  const wrap = useRef<HTMLDivElement>(null);

  // A small "−5" appears beside the number when something is spent (or "+250" when credits arrive).
  useEffect(() => {
    if (snap.total === last.current) return;
    const d = snap.total - last.current;
    last.current = snap.total;
    const show = setTimeout(() => setDelta(d), 0);
    const hide = setTimeout(() => setDelta(null), 2600);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, [snap.total]);

  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => wrap.current && !wrap.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const share = snap.monthlyOf > 0 ? snap.monthly / snap.monthlyOf : 0;
  const empty = snap.total <= 0;
  const days = Math.max(0, Math.ceil((new Date(snap.periodEnd).getTime() - new Date(snap.at).getTime()) / 86_400_000));
  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`${snap.total} credits left. Open usage details`}
        className={`relative flex items-center gap-2 rounded-full border px-2.5 py-1.5 text-xs font-semibold transition-colors ${empty ? "border-brand-sell/40 bg-brand-sell/[0.06] text-brand-sell" : "border-brand-navy/10 bg-white text-brand-navy hover:border-brand-primary/40"}`}
      >
        <Coins size={14} className={empty ? "text-brand-sell" : "text-brand-gold"} />
        <span className="num tabular-nums">{fmt(total)}</span>
        <span className="hidden h-1.5 w-10 overflow-hidden rounded-full bg-brand-navy/10 sm:block">
          <span className={`block h-full rounded-full transition-all duration-700 ${tone(share)}`} style={{ width: `${Math.round(share * 100)}%` }} />
        </span>
        {snap.topup > 0 && <span aria-hidden title="Top-up credits" className="hidden h-1.5 w-4 rounded-full bg-brand-gold sm:block" />}
        {delta !== null && delta !== 0 && (
          <span aria-hidden className={`absolute -bottom-5 right-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold shadow-sm ${delta < 0 ? "bg-brand-navy text-white" : "bg-brand-buy text-white"}`}>
            {delta > 0 ? "+" : "−"}{Math.abs(delta)}
          </span>
        )}
      </button>
      {open && (
        <div role="dialog" aria-label="Your credits" className="absolute right-0 top-full z-40 mt-2 w-72 rounded-2xl bg-white p-4 text-brand-navy shadow-[0_24px_48px_-20px_rgba(14,27,45,0.45)] ring-1 ring-black/[0.07]">
          <div className="flex items-baseline justify-between">
            <p className="text-sm font-bold">{snap.planLabel} plan</p>
            <p className="text-[11px] text-brand-navy/50">renews {day(snap.periodEnd)} · {days} day{days === 1 ? "" : "s"}</p>
          </div>
          <p className="num mt-2 text-2xl font-bold tabular-nums">{fmt(snap.total)} <span className="text-sm font-medium text-brand-navy/50">credits left</span></p>
          <div className="mt-3">
            <div className="flex items-baseline justify-between text-[11px]">
              <span className="font-semibold text-brand-navy/70">Monthly plan credits</span>
              <span className="num tabular-nums text-brand-navy/55">{fmt(snap.monthly)} of {fmt(snap.monthlyOf)}</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-brand-navy/[0.08]">
              <div className={`h-full rounded-full transition-all duration-700 ${tone(share)}`} style={{ width: `${Math.round(share * 100)}%` }} />
            </div>
          </div>
          {snap.topup > 0 && (
            <div className="mt-2.5">
              <div className="flex items-baseline justify-between text-[11px]">
                <span className="font-semibold text-brand-navy/70">Top-up credits</span>
                <span className="num tabular-nums text-brand-navy/55">{fmt(snap.topup)}</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-brand-navy/[0.08]">
                <div className="h-full w-full rounded-full bg-brand-gold transition-all duration-700" />
              </div>
              <p className="mt-1 text-[10px] text-brand-navy/45">Used after your monthly credits · kept for a year</p>
            </div>
          )}
          {snap.aiRepliesLeft !== null && (
            <p className="mt-2 rounded-lg bg-brand-primary/[0.06] px-2.5 py-1.5 text-xs text-brand-navy/75">
              <strong>{snap.aiRepliesLeft}</strong> free AI repl{snap.aiRepliesLeft === 1 ? "y" : "ies"} left, ever. Backtests use the credits above.
            </p>
          )}
          {snap.plan !== "FREE" && (
            <div className="mt-3 space-y-2">
              <Bar used={snap.today.ai.used} cap={snap.today.ai.cap} label="AI replies" icon={<Sparkles size={11} />} />
              <Bar used={snap.today.builds.used} cap={snap.today.builds.cap} label="Builds" icon={<Wrench size={11} />} />
              <Bar used={snap.today.voice.used} cap={snap.today.voice.cap} label="Voice" icon={<Mic size={11} />} />
            </div>
          )}
          {empty && <p className="mt-3 rounded-lg bg-brand-sell/[0.07] px-2.5 py-1.5 text-xs font-medium text-brand-sell">You&apos;re out of credits. AI and backtests are paused; live trading and your risk controls keep running.</p>}
          <Link href="/app/account/usage" onClick={() => setOpen(false)} className="mt-3 inline-flex text-xs font-semibold text-brand-primary hover:underline">
            Usage, prices and history →
          </Link>
        </div>
      )}
    </div>
  );
}
