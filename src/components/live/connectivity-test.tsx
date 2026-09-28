"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, CircleX, PlugZap } from "lucide-react";
import { runConnectivityTest, type TestStep } from "@/lib/live-actions";

/** Places a 1-share limit buy far below the market through the static IP, then cancels it. */
export default function ConnectivityTest({ instruments, ready }: { instruments: { symbol: string; name: string }[]; ready: boolean }) {
  const [symbol, setSymbol] = useState(instruments.find((i) => i.symbol === "ITC.NS")?.symbol ?? instruments[0]?.symbol ?? "");
  const [steps, setSteps] = useState<TestStep[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3">
      <p className="text-sm text-brand-navy/65">
        Proves the whole path works — your Groww session, the static IP and order placement — without trading: a <strong>1-share limit buy about 8% below the market</strong> (so it won&apos;t fill),
        cancelled a moment later. It shows up on Groww as a cancelled order.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <select value={symbol} onChange={(e) => setSymbol(e.target.value)} className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm">
          {instruments.map((i) => (
            <option key={i.symbol} value={i.symbol}>
              {i.symbol.replace(".NS", "")} — {i.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!ready || pending || !symbol}
          onClick={() => {
            if (!window.confirm(`Place a real 1-share limit BUY for ${symbol.replace(".NS", "")} on Groww (about 8% below the market), then cancel it?`)) return;
            start(async () => {
              setError(null);
              setSteps(null);
              const r = await runConnectivityTest(symbol);
              if (r.ok) setSteps(r.data ?? []);
              else setError(r.error);
            });
          }}
          className="inline-flex items-center gap-1.5 rounded-full bg-brand-primary px-4 py-2 text-sm font-semibold text-white hover:bg-brand-primary-light disabled:opacity-40"
        >
          <PlugZap size={15} /> {pending ? "Testing with Groww…" : "Run the test"}
        </button>
      </div>
      {!ready && <p className="text-xs text-brand-navy/50">Fix the items marked above first.</p>}
      {error && <p className="rounded-xl bg-brand-sell/5 px-3 py-2 text-sm text-brand-sell">{error}</p>}
      {steps && (
        <ol className="space-y-1.5 rounded-xl bg-brand-bg/70 p-3">
          {steps.map((s, k) => (
            <li key={k} className="flex items-start gap-2 text-sm">
              {s.ok ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-brand-buy" /> : <CircleX size={16} className="mt-0.5 shrink-0 text-brand-sell" />}
              <span>
                <span className="text-brand-navy">{s.step}</span>
                {s.detail && <span className="block text-xs text-brand-navy/50">{s.detail}</span>}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
