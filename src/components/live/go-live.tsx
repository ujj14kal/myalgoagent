"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Rocket, X } from "lucide-react";
import { goLive } from "@/lib/live-actions";

export type GoLiveBroker = { id: string; name: string; ready: boolean; loggedIn: boolean };

/**
 * Deploys this strategy to the user's broker: the same rules as its forward
 * test, sending real orders — automatically, or waiting for a tap on each.
 */
export default function GoLive({
  strategyId,
  strategyName,
  symbol,
  brokers,
  enabled,
  liveOn,
  blocker,
  intraday = false,
}: {
  strategyId: string;
  strategyName: string;
  symbol: string;
  brokers: GoLiveBroker[];
  enabled: boolean;
  liveOn: string[];
  blocker: string | null;
  intraday?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const usable = brokers.filter((b) => b.ready && !liveOn.includes(b.id));
  const [broker, setBroker] = useState(usable[0]?.id ?? "");
  const [capital, setCapital] = useState(100000);
  const [ack, setAck] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  if (liveOn.length && !open)
    return (
      <Link href="/app/live-trading" className="inline-flex items-center gap-1.5 rounded-full bg-brand-buy/10 px-4 py-2 text-sm font-semibold text-[#0b6b30] ring-1 ring-brand-buy/30">
        <span className="h-2 w-2 animate-pulse rounded-full bg-brand-buy" /> Live on {liveOn.length} broker{liveOn.length === 1 ? "" : "s"}
      </Link>
    );
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-full bg-brand-navy px-4 py-2 text-sm font-semibold text-white">
        <Rocket size={14} /> Go live
      </button>
    );

  const plain = symbol.replace(/\.NS$/, "");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-lg font-semibold text-brand-navy">Go live: {strategyName}</p>
            <p className="text-sm text-brand-navy/60">Real orders for {plain} on your own broker account, using exactly this strategy&apos;s rules and risk settings.</p>
          </div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="text-brand-navy/40 hover:text-brand-navy">
            <X size={18} />
          </button>
        </div>

        {blocker || !enabled ? (
          <p className="mt-4 rounded-xl bg-brand-gold/10 px-3 py-2 text-sm text-brand-navy/75">{blocker ?? "Live trading isn't switched on for your account yet."}</p>
        ) : usable.length === 0 ? (
          <p className="mt-4 rounded-xl bg-brand-gold/10 px-3 py-2 text-sm text-brand-navy/75">
            No broker is ready yet. On{" "}
            <Link href="/app/live-trading" className="font-semibold text-brand-primary">
              Live Trading
            </Link>
            , log in to your broker for today and run &ldquo;Check I&apos;m ready&rdquo; (it places no order).
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            <label className="block text-sm">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-brand-navy/45">Broker</span>
              <select value={broker} onChange={(e) => setBroker(e.target.value)} className="w-full rounded-lg border border-brand-navy/15 px-3 py-2">
                {usable.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} — ready
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-brand-navy/45">Capital this strategy may use (₹)</span>
              <input type="number" min={1000} step={1000} value={capital} onChange={(e) => setCapital(Number(e.target.value))} className="w-full rounded-lg border border-brand-navy/15 px-3 py-2" />
              <span className="mt-1 block text-xs text-brand-navy/50">
                {intraday
                  ? "Intraday trades are margin trades: orders are sized with up to 5× this amount as buying power (your broker decides the margin it really needs and refuses an order it can't cover). "
                  : "Used with the strategy's position size. "}
                Your per-order and daily limits in Risk Controls still apply.
              </span>
            </label>
            <p className="rounded-xl bg-brand-primary/[0.05] px-3 py-2 text-xs leading-relaxed text-brand-navy/70">
              <strong className="font-semibold text-brand-navy">Orders are sent automatically.</strong> When your strategy&apos;s entry or exit rules fire, the order goes straight to your broker — no extra tap needed. Pause or stop it any time from Live Trading.
            </p>
            <label className="flex items-start gap-2 text-xs text-brand-navy/75">
              <input type="checkbox" className="mt-0.5" checked={ack} onChange={(e) => setAck(e.target.checked)} />
              <span>
                I understand this automatically places real orders on my broker account whenever this strategy&apos;s rules fire, that I can lose money, that I can pause or stop it at any time from Live Trading, and that I decided to deploy it — this isn&apos;t advice.
              </span>
            </label>
            {error && <p className="rounded-lg bg-brand-sell/5 px-3 py-2 text-sm text-brand-sell">{error}</p>}
            <button
              type="button"
              disabled={!ack || pending || !broker}
              onClick={() =>
                start(async () => {
                  const r = await goLive({ strategyId, broker, capital, acknowledged: ack });
                  if (!r.ok) return setError(r.error);
                  router.push("/app/live-trading");
                })
              }
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-brand-navy px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              <Rocket size={14} /> {pending ? "Deploying…" : `Deploy to ${usable.find((b) => b.id === broker)?.name ?? "broker"}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
