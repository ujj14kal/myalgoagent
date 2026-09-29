"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Radio, ShieldAlert } from "lucide-react";
import { placeOptionsBasket, previewOptionsBasket } from "@/lib/live-actions";
import type { BasketPreview } from "@/lib/live/options-basket";
import type { OptionLeg } from "@/lib/options/positions";

export type BasketBroker = { id: string; name: string; carry: boolean };

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

/**
 * Sends the Options Lab's legs as real orders on the user's own broker account:
 * a server-priced preview first, then an explicit confirmation. Nothing is sent without it.
 */
export default function LiveBasket({ brokers, underlying, expiry, legs }: { brokers: BasketBroker[]; underlying: string; expiry: string; legs: OptionLeg[] }) {
  const [open, setOpen] = useState(false);
  const [broker, setBroker] = useState(brokers[0]?.id ?? "");
  const [product, setProduct] = useState<"MIS" | "NRML">("MIS");
  const [preview, setPreview] = useState<BasketPreview | null>(null);
  const [agree, setAgree] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const input = () => ({ broker, product, underlying, expiry, legs: legs.map((l) => ({ type: l.type, side: l.side, strike: l.strike, lots: l.lots })) });
  const carryOk = brokers.find((b) => b.id === broker)?.carry ?? false;

  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} disabled={!legs.length} className="inline-flex items-center gap-1.5 rounded-full bg-brand-navy px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
        <Radio size={14} /> Place these legs live…
      </button>
    );

  return (
    <section className="surface space-y-3 p-4 ring-1 ring-brand-sell/20">
      <p className="flex items-center gap-2 text-sm font-semibold text-brand-navy">
        <ShieldAlert size={16} className="text-brand-sell" /> Real orders on your broker account
      </p>
      <div className="flex flex-wrap gap-2 text-sm">
        <select value={broker} onChange={(e) => (setBroker(e.target.value), setPreview(null))} className="rounded-lg border border-brand-navy/15 px-2.5 py-1.5">
          {brokers.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <select value={product} onChange={(e) => (setProduct(e.target.value as "MIS" | "NRML"), setPreview(null))} className="rounded-lg border border-brand-navy/15 px-2.5 py-1.5">
          <option value="MIS">Intraday (squared off by your broker today)</option>
          {carryOk && <option value="NRML">Carry forward (overnight)</option>}
        </select>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setMessage(null);
              setAgree(false);
              const r = await previewOptionsBasket(input());
              if (!r.ok) return setMessage({ ok: false, text: r.error });
              setPreview(r.data!);
            })
          }
          className="rounded-full px-4 py-1.5 text-sm font-semibold text-brand-primary ring-1 ring-brand-primary/30 disabled:opacity-40"
        >
          {pending && !preview ? "Checking…" : "Preview orders"}
        </button>
        <button type="button" onClick={() => (setOpen(false), setPreview(null))} className="px-2 text-sm text-brand-navy/50">
          Close
        </button>
      </div>

      {preview && (
        <div className="space-y-3">
          <table className="w-full text-xs tabular-nums">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wide text-brand-navy/45">
                {["#", "Order", "Contract", "Qty", "Limit ₹", "Bid / Ask", "Premium"].map((h) => (
                  <th key={h} className="pb-1.5 pr-2 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.legs.map((l, i) => (
                <tr key={i} className="border-t border-black/5">
                  <td className="py-1.5 pr-2 text-brand-navy/45">{i + 1}</td>
                  <td className={`py-1.5 pr-2 font-bold ${l.side === "BUY" ? "text-[#0b6b30]" : "text-[#9b1111]"}`}>{l.side}</td>
                  <td className="py-1.5 pr-2 font-semibold text-brand-navy">{l.contract.exchangeSymbol}</td>
                  <td className="py-1.5 pr-2">
                    {l.quantity} <span className="text-brand-navy/40">({l.lots} × {l.lotSize})</span>
                  </td>
                  <td className="py-1.5 pr-2">{l.limitPrice.toFixed(2)}</td>
                  <td className="py-1.5 pr-2 text-brand-navy/55">
                    {l.bid?.toFixed(2) ?? "—"} / {l.ask?.toFixed(2) ?? "—"}
                  </td>
                  <td className="py-1.5 pr-2">{inr(l.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-brand-navy/60">
            Premium paid {inr(preview.premiumPaid)} · received {inr(preview.premiumReceived)} · buy legs are sent first. Each is a limit order 1% through the current quote; prices are
            re-checked when you confirm. Margin for sold options is set by {preview.brokerName}, which may reject a leg — if one fails, legs still open are cancelled and any that
            filled are listed for you to decide on.
          </p>
          <label className="flex items-start gap-2 text-xs text-brand-navy/75">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5" />
            <span>
              I understand these are real orders on my {preview.brokerName} account, that options can lose far more than the premium received, and that I&apos;m deciding to place them — this isn&apos;t advice.
            </span>
          </label>
          <button
            type="button"
            disabled={!agree || pending}
            onClick={() =>
              start(async () => {
                const r = await placeOptionsBasket(input());
                setPreview(null);
                setAgree(false);
                setMessage(r.ok ? { ok: r.data!.failedAt === null, text: r.data!.message } : { ok: false, text: r.error });
              })
            }
            className="rounded-full bg-brand-sell px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {pending ? "Sending…" : `Confirm & send ${preview.legs.length} order${preview.legs.length === 1 ? "" : "s"}`}
          </button>
        </div>
      )}
      {message && (
        <p className={`text-sm ${message.ok ? "text-[#0b6b30]" : "text-brand-sell"}`}>
          {message.text}{" "}
          <Link href="/app/live-trading" className="font-semibold text-brand-primary">
            See orders →
          </Link>
        </p>
      )}
    </section>
  );
}
