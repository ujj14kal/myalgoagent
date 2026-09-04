"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { startPaperSession } from "@/lib/paper-actions";
import PositionSizingFields from "@/components/position-sizing-fields";
import type { PositionSizingMode } from "@/lib/trading-engine/step";

interface StrategyOption {
  id: string;
  name: string;
  instrumentSymbol: string;
}

export default function PaperSessionForm({ strategies }: { strategies: StrategyOption[] }) {
  const [strategyId, setStrategyId] = useState(strategies[0]?.id ?? "");
  const [startingCapital, setStartingCapital] = useState(100000);
  const [brokeragePercent, setBrokeragePercent] = useState(0.03);
  const [slippagePercent, setSlippagePercent] = useState(0.05);
  const [positionSizingMode, setPositionSizingMode] = useState<PositionSizingMode>("FULL_CAPITAL");
  const [positionSizingValue, setPositionSizingValue] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await startPaperSession({
          strategyId,
          startingCapital,
          brokeragePercent,
          slippagePercent,
          positionSizingMode,
          positionSizingValue,
        });
      } catch (err) {
        if (err && typeof err === "object" && "digest" in err && String(err.digest).startsWith("NEXT_REDIRECT")) {
          throw err;
        }
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  if (strategies.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-brand-navy/15 p-6 text-sm text-brand-navy/60">
        You need a strategy before you can start paper trading.{" "}
        <Link href="/app/strategies/new" className="font-medium text-brand-primary hover:underline">
          Create one first →
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-black/5 bg-white p-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-navy/40">Strategy</label>
          <select
            value={strategyId}
            onChange={(e) => setStrategyId(e.target.value)}
            className="w-full rounded-lg border border-brand-navy/15 px-3 py-2 text-sm outline-none focus:border-brand-primary"
          >
            {strategies.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.instrumentSymbol})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-navy/40">Capital (₹)</label>
          <input
            type="number"
            min={1}
            value={startingCapital}
            onChange={(e) => setStartingCapital(Number(e.target.value))}
            className="w-full rounded-lg border border-brand-navy/15 px-3 py-2 text-sm outline-none focus:border-brand-primary"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-navy/40">Brokerage (%)</label>
          <input
            type="number"
            min={0}
            step={0.01}
            value={brokeragePercent}
            onChange={(e) => setBrokeragePercent(Number(e.target.value))}
            className="w-full rounded-lg border border-brand-navy/15 px-3 py-2 text-sm outline-none focus:border-brand-primary"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-navy/40">Slippage (%)</label>
          <input
            type="number"
            min={0}
            step={0.01}
            value={slippagePercent}
            onChange={(e) => setSlippagePercent(Number(e.target.value))}
            className="w-full rounded-lg border border-brand-navy/15 px-3 py-2 text-sm outline-none focus:border-brand-primary"
          />
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <PositionSizingFields
          mode={positionSizingMode}
          value={positionSizingValue}
          onModeChange={setPositionSizingMode}
          onValueChange={setPositionSizingValue}
        />
      </div>

      <div className="mt-4">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-full bg-brand-primary px-6 py-2 text-sm font-medium text-white hover:bg-brand-primary-light disabled:opacity-50"
        >
          {isPending ? "Starting…" : "Start Paper Trading"}
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-brand-sell">{error}</p>}
    </form>
  );
}
