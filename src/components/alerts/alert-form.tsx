"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BellPlus } from "lucide-react";
import { createPriceAlert } from "@/lib/alerts/alert-actions";

/** Set a price alert: an instrument, above or below, and the price. */
export default function AlertForm({ suggestions }: { suggestions: string[] }) {
  const router = useRouter();
  const [symbol, setSymbol] = useState("");
  const [direction, setDirection] = useState<"ABOVE" | "BELOW">("ABOVE");
  const [price, setPrice] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const input = "w-full rounded-lg border border-brand-navy/15 px-2.5 py-1.5 text-sm outline-none focus:border-brand-primary";
  const label = "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-brand-navy/45";

  const submit = () =>
    start(async () => {
      setDone(null);
      const r = await createPriceAlert({ symbol, direction, price: Number(price), note });
      if (!r.ok) return setError(r.error);
      setError(null);
      setDone(r.data?.current != null ? `Alert set. The last price is ₹${r.data.current.toLocaleString("en-IN", { maximumFractionDigits: 2 })}.` : "Alert set.");
      setPrice("");
      setNote("");
      router.refresh();
    });

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block">
          <span className={label}>Instrument</span>
          <input list="alert-symbols" value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="RELIANCE, ^NSEI, BTC-INR" className={input} />
          <datalist id="alert-symbols">
            {suggestions.map((s) => (
              <option key={s} value={s.replace(/\.NS$/, "")} />
            ))}
          </datalist>
        </label>
        <label className="block">
          <span className={label}>When the price is</span>
          <select value={direction} onChange={(e) => setDirection(e.target.value as "ABOVE" | "BELOW")} className={input}>
            <option value="ABOVE">at or above</option>
            <option value="BELOW">at or below</option>
          </select>
        </label>
        <label className="block">
          <span className={label}>Price (₹)</span>
          <input type="number" min={0} step="any" value={price} onChange={(e) => setPrice(e.target.value)} className={input} />
        </label>
        <label className="block">
          <span className={label}>Note (optional)</span>
          <input value={note} maxLength={120} onChange={(e) => setNote(e.target.value)} className={input} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={pending || !symbol.trim() || !price} onClick={submit} className="inline-flex items-center gap-1.5 rounded-full bg-brand-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          <BellPlus size={15} /> {pending ? "Setting…" : "Set alert"}
        </button>
        {error && <p className="text-sm text-brand-sell">{error}</p>}
        {done && <p className="text-sm text-[#0b6b30]">{done}</p>}
      </div>
    </div>
  );
}
