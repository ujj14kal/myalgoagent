"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FlaskConical, Pencil, Plus, Trash2 } from "lucide-react";
import StrategyEditor from "./strategy-editor";
import { deleteOptionStrategy, startOptionBacktest, type OptionStrategyInput } from "@/lib/option-strategy-actions";

const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const EXPIRY = { WEEKLY_CURRENT: "nearest expiry", WEEKLY_NEXT: "next expiry", MONTHLY: "monthly expiry" } as const;
const legText = (l: OptionStrategyInput["legs"][number]) => `${l.side === "BUY" ? "Buy" : "Sell"} ${l.lots}× ${l.offset === 0 ? "ATM" : l.offset > 0 ? `ATM+${l.offset}` : `ATM${l.offset}`} ${l.type}`;
const isoDaysAgo = (n: number) => new Date(Date.now() + 5.5 * 3_600_000 - n * 86_400_000).toISOString().slice(0, 10);

function Launcher({ id }: { id: string }) {
  const [from, setFrom] = useState(isoDaysAgo(90));
  const [to, setTo] = useState(isoDaysAgo(0));
  const [brokerage, setBrokerage] = useState(20);
  const [slippage, setSlippage] = useState(0.5);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const cls = "rounded-lg border border-brand-navy/15 px-2 py-1 text-xs";
  return (
    <div className="mt-3 flex flex-wrap items-end gap-2 rounded-xl bg-brand-bg/70 p-3">
      <label className="text-[11px] text-brand-navy/55">
        From
        <input type="date" value={from} min="2020-01-01" onChange={(e) => setFrom(e.target.value)} className={`${cls} ml-1`} />
      </label>
      <label className="text-[11px] text-brand-navy/55">
        To
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${cls} ml-1`} />
      </label>
      <label className="text-[11px] text-brand-navy/55" title="Per order, each leg is two orders">
        Brokerage ₹/order
        <input type="number" min={0} value={brokerage} onChange={(e) => setBrokerage(Number(e.target.value))} className={`${cls} ml-1 w-16`} />
      </label>
      <label className="text-[11px] text-brand-navy/55">
        Slippage %
        <input type="number" min={0} step="0.1" value={slippage} onChange={(e) => setSlippage(Number(e.target.value))} className={`${cls} ml-1 w-16`} />
      </label>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await startOptionBacktest({ strategyId: id, fromDate: from, toDate: to, brokeragePerOrder: brokerage, slippagePct: slippage });
            if (!r.ok) return setError(r.error);
            router.push(`/app/options/backtests/${r.data!.runId}`);
          })
        }
        className="inline-flex items-center gap-1.5 rounded-full bg-brand-primary px-3.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
      >
        <FlaskConical size={13} /> {pending ? "Starting…" : "Run backtest"}
      </button>
      {error && <p className="w-full text-xs text-brand-sell">{error}</p>}
    </div>
  );
}

export default function StrategyList({ strategies }: { strategies: (OptionStrategyInput & { id: string })[] }) {
  const [editing, setEditing] = useState<string | "new" | null>(strategies.length ? null : "new");
  const [testing, setTesting] = useState<string | null>(null);
  const [, start] = useTransition();
  const router = useRouter();
  return (
    <div className="space-y-4">
      {editing === "new" ? (
        <section className="surface p-5">
          <p className="mb-3 text-sm font-semibold text-brand-navy">New options strategy</p>
          <StrategyEditor onDone={strategies.length ? () => setEditing(null) : undefined} />
        </section>
      ) : (
        <button type="button" onClick={() => setEditing("new")} className="inline-flex items-center gap-1.5 rounded-full bg-brand-primary px-4 py-2 text-sm font-semibold text-white">
          <Plus size={15} /> New options strategy
        </button>
      )}
      {strategies.map((s) => (
        <section key={s.id} className="surface p-4">
          {editing === s.id ? (
            <StrategyEditor initial={s} onDone={() => setEditing(null)} />
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-brand-navy">{s.name}</p>
                  <p className="text-xs text-brand-navy/55">
                    {s.underlying} · {EXPIRY[s.expiryRule]} · enter {toTime(s.entryMinute)}, exit {toTime(s.exitMinute)}
                    {s.stopLossUnit && ` · SL ${s.stopLossUnit === "RUPEES" ? `₹${s.stopLossValue}` : `${s.stopLossValue}% of premium`}`}
                    {s.targetUnit && ` · target ${s.targetUnit === "RUPEES" ? `₹${s.targetValue}` : `${s.targetValue}% of premium`}`}
                  </p>
                  <p className="mt-1 text-xs text-brand-navy/70">{s.legs.map(legText).join(" · ")}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => setTesting(testing === s.id ? null : s.id)} className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold text-brand-primary ring-1 ring-brand-primary/30">
                    <FlaskConical size={13} /> Backtest
                  </button>
                  <button type="button" onClick={() => setEditing(s.id)} aria-label="Edit" className="rounded-full p-2 text-brand-navy/45 hover:text-brand-primary">
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    aria-label="Delete"
                    onClick={() => {
                      if (window.confirm(`Delete "${s.name}"? Its past backtests stay.`)) start(async () => (await deleteOptionStrategy(s.id), router.refresh()));
                    }}
                    className="rounded-full p-2 text-brand-navy/45 hover:text-brand-sell"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              {testing === s.id && <Launcher id={s.id} />}
            </>
          )}
        </section>
      ))}
    </div>
  );
}
