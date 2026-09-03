"use client";

import { useState, useTransition } from "react";
import ConditionGroupEditor, { defaultComparison } from "@/components/condition-group-editor";
import StrategyCodeEditor from "@/components/strategy-code-editor";
import { createStrategy, updateStrategy, type StrategyInput } from "@/lib/strategy-actions";
import type { ConditionNode } from "@/lib/strategy";

interface InstrumentOption {
  id: string;
  symbol: string;
  name: string;
}

function defaultGroup(): ConditionNode {
  return { kind: "group", op: "AND", children: [defaultComparison()] };
}

export default function StrategyBuilderForm({
  instruments,
  strategyId,
  initial,
}: {
  instruments: InstrumentOption[];
  strategyId?: string;
  initial?: {
    name: string;
    instrumentId: string;
    mode: "NO_CODE" | "CODE";
    entryCondition: ConditionNode;
    exitCondition: ConditionNode;
    entrySource: string | null;
    exitSource: string | null;
  };
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [instrumentId, setInstrumentId] = useState(initial?.instrumentId ?? instruments[0]?.id ?? "");
  const [mode, setMode] = useState<"NO_CODE" | "CODE">(initial?.mode ?? "NO_CODE");
  const [entryCondition, setEntryCondition] = useState<ConditionNode>(initial?.entryCondition ?? defaultGroup());
  const [exitCondition, setExitCondition] = useState<ConditionNode>(initial?.exitCondition ?? defaultGroup());
  const [entrySource, setEntrySource] = useState(initial?.entrySource ?? "sma(20) crossesAbove ema(50)");
  const [exitSource, setExitSource] = useState(initial?.exitSource ?? "sma(20) crossesBelow ema(50)");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const input: StrategyInput =
      mode === "CODE"
        ? { name, instrumentId, mode, entrySource, exitSource }
        : { name, instrumentId, mode, entryCondition, exitCondition };

    startTransition(async () => {
      try {
        if (strategyId) {
          await updateStrategy(strategyId, input);
        } else {
          await createStrategy(input);
        }
      } catch (err) {
        // `createStrategy` redirects on success, which Next.js implements by
        // throwing a special error — let that propagate instead of treating
        // it as a form-validation failure.
        if (err && typeof err === "object" && "digest" in err && String(err.digest).startsWith("NEXT_REDIRECT")) {
          throw err;
        }
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-navy/40">
            Strategy name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full rounded-lg border border-brand-navy/15 px-4 py-2 text-sm outline-none focus:border-brand-primary"
            placeholder="e.g. SMA/EMA crossover"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-navy/40">
            Instrument
          </label>
          <select
            value={instrumentId}
            onChange={(e) => setInstrumentId(e.target.value)}
            required
            className="w-full rounded-lg border border-brand-navy/15 px-4 py-2 text-sm outline-none focus:border-brand-primary"
          >
            {instruments.map((i) => (
              <option key={i.id} value={i.id}>
                {i.symbol} — {i.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-navy/40">
          Build with
        </label>
        <div className="flex overflow-hidden rounded-full border border-brand-navy/15 w-fit">
          {(["NO_CODE", "CODE"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`px-4 py-1.5 text-sm font-medium ${
                mode === m ? "bg-brand-primary text-white" : "text-brand-navy/60 hover:bg-brand-bg"
              }`}
            >
              {m === "NO_CODE" ? "Build visually" : "Write code"}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-black/5 bg-white p-4">
        <p className="mb-2 text-sm font-semibold text-brand-navy">Entry condition</p>
        {mode === "NO_CODE" ? (
          <ConditionGroupEditor node={entryCondition} onChange={setEntryCondition} />
        ) : (
          <StrategyCodeEditor label="Entry" value={entrySource} onChange={setEntrySource} />
        )}
      </div>

      <div className="rounded-2xl border border-black/5 bg-white p-4">
        <p className="mb-2 text-sm font-semibold text-brand-navy">Exit condition</p>
        {mode === "NO_CODE" ? (
          <ConditionGroupEditor node={exitCondition} onChange={setExitCondition} />
        ) : (
          <StrategyCodeEditor label="Exit" value={exitSource} onChange={setExitSource} />
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-brand-sell/30 bg-brand-sell/5 p-3 text-sm text-brand-sell">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="rounded-full bg-brand-primary px-6 py-2 text-sm font-medium text-white hover:bg-brand-primary-light disabled:opacity-50"
      >
        {isPending ? "Saving…" : strategyId ? "Save changes" : "Create strategy"}
      </button>
    </form>
  );
}
