"use client";
import InstrumentCombobox from "@/components/instrument-combobox";

import { useState, useTransition } from "react";
import { CheckCircle2, CircleX, PlugZap } from "lucide-react";
import { runConnectivityTest, type TestStep } from "@/lib/live-actions";

/** Places a 1-share limit buy far below the market through the static IP, then cancels it. */
export default function ConnectivityTest({ instruments, brokers, ready }: { instruments: { symbol: string; name: string }[]; brokers: { id: string; name: string; verified: boolean }[]; ready: boolean }) {
  const [broker, setBroker] = useState(brokers[0]?.id ?? "");
  const [symbol, setSymbol] = useState(instruments.find((i) => i.symbol === "ITC.NS")?.symbol ?? instruments[0]?.symbol ?? "");
  const [steps, setSteps] = useState<TestStep[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-3">
      <p className="text-sm text-brand-navy/65">
        Proves the whole path works — your broker session, the static IP, order placement and that the broker ordered the right stock — without trading: a <strong>1-share limit buy about 8% below the market</strong> (so it won&apos;t fill),
        cancelled a moment later. It shows up in your broker app as a cancelled order. Passing it once is how a broker marked &ldquo;not yet proven&rdquo; is confirmed.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <select value={broker} onChange={(e) => setBroker(e.target.value)} className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm" aria-label="Broker">
          {brokers.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
              {b.verified ? "" : " (not yet proven)"}
            </option>
          ))}
        </select>
        <InstrumentCombobox className="min-w-56" options={instruments.filter((i) => i.symbol.endsWith(".NS"))} valueKey="symbol" value={symbol} onChange={setSymbol} />
        <button
          type="button"
          disabled={!ready || pending || !symbol || !broker}
          onClick={() => {
            const name = brokers.find((b) => b.id === broker)?.name ?? broker;
            if (!window.confirm(`Place a real 1-share limit BUY for ${symbol.replace(".NS", "")} at ${name} (about 8% below the market), then cancel it?`)) return;
            start(async () => {
              setError(null);
              setSteps(null);
              const r = await runConnectivityTest(broker, symbol);
              if (r.ok) setSteps(r.data ?? []);
              else setError(r.error);
            });
          }}
          className="inline-flex items-center gap-1.5 rounded-full bg-brand-primary px-4 py-2 text-sm font-semibold text-white hover:bg-brand-primary-light disabled:opacity-40"
        >
          <PlugZap size={15} /> {pending ? "Testing…" : "Run the test"}
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
