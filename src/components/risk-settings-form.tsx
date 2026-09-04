"use client";

import { useState, useTransition } from "react";
import { updateRiskSettings } from "@/lib/risk-actions";

export default function RiskSettingsForm({
  killSwitchEnabled,
  initialMaxLossPercent,
  initialMaxConsecutiveLosses,
}: {
  killSwitchEnabled: boolean;
  initialMaxLossPercent: number | null;
  initialMaxConsecutiveLosses: number | null;
}) {
  const [maxLossPercent, setMaxLossPercent] = useState(initialMaxLossPercent?.toString() ?? "");
  const [maxConsecutiveLosses, setMaxConsecutiveLosses] = useState(initialMaxConsecutiveLosses?.toString() ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        await updateRiskSettings({
          killSwitchEnabled,
          maxLossPercent: maxLossPercent.trim() ? Number(maxLossPercent) : null,
          maxConsecutiveLosses: maxConsecutiveLosses.trim() ? Number(maxConsecutiveLosses) : null,
        });
        setSaved(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-black/5 bg-white p-5">
      <p className="text-sm font-semibold text-brand-navy">Loss limits</p>
      <p className="mt-1 text-xs text-brand-navy/60">
        Applies to all your paper trading sessions. A session that crosses a
        limit is automatically stopped, and won&rsquo;t open new positions
        until you restart it.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-navy/40">
            Max loss per session (%)
          </label>
          <input
            type="number"
            min={0}
            max={100}
            step={0.1}
            placeholder="No limit"
            value={maxLossPercent}
            onChange={(e) => setMaxLossPercent(e.target.value)}
            className="w-full rounded-lg border border-brand-navy/15 px-3 py-2 text-sm outline-none focus:border-brand-primary"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-navy/40">
            Max consecutive losses
          </label>
          <input
            type="number"
            min={1}
            step={1}
            placeholder="No limit"
            value={maxConsecutiveLosses}
            onChange={(e) => setMaxConsecutiveLosses(e.target.value)}
            className="w-full rounded-lg border border-brand-navy/15 px-3 py-2 text-sm outline-none focus:border-brand-primary"
          />
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-full bg-brand-primary px-6 py-2 text-sm font-medium text-white hover:bg-brand-primary-light disabled:opacity-50"
        >
          {isPending ? "Saving…" : "Save limits"}
        </button>
        {saved && <span className="text-xs text-brand-buy">Saved.</span>}
      </div>

      {error && <p className="mt-3 text-sm text-brand-sell">{error}</p>}
    </form>
  );
}
