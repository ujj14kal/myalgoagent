"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Wand2 } from "lucide-react";
import StrategyEditor from "@/components/options/strategy-editor";
import { strategyFromLegs } from "@/lib/options/strategy-from-legs";
import type { OptionLeg } from "@/lib/options/positions";

// Turns the contracts picked in the Options Lab into a saved options strategy: each leg's strike becomes "N strikes from
// the at-the-money strike" (so the strategy re-picks live strikes every day it trades), and the chosen expiry becomes an
// expiry rule. Everything else (entry and exit time, days, stop-loss, target) is set in the same editor used everywhere.

export default function StrategyFromLegs({ legs, underlying, step, spot, expiries, expiry }: { legs: OptionLeg[]; underlying: string; step: number; spot: number; expiries: string[]; expiry: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const atm = Math.round(spot / step) * step;
  const built = useMemo(() => strategyFromLegs({ legs, underlying, step, atm, expiries, expiry }), [legs, underlying, step, atm, expiries, expiry]);

  return (
    <div className="mt-5 rounded-xl border border-brand-navy/10 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-brand-navy">Make these legs a strategy</p>
          <p className="text-xs text-brand-navy/50">Save the position you built as a strategy you can backtest on real option prices and forward test. Strikes are kept as “N strikes from at-the-money”, so it re-picks them each day.</p>
        </div>
        {!open && !saved && (
          <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-full bg-brand-primary px-4 py-2 text-sm font-semibold text-white">
            <Wand2 size={14} /> Create strategy from these legs
          </button>
        )}
      </div>
      {saved && (
        <p className="mt-3 text-sm font-medium text-brand-buy">
          Strategy saved.{" "}
          <Link href="/app/options/strategies" className="font-semibold text-brand-primary hover:underline">
            Open it to backtest or forward test →
          </Link>
        </p>
      )}
      {open && (
        <div className="mt-4">
          {built.notes.length > 0 && (
            <ul className="mb-3 list-disc space-y-0.5 rounded-lg bg-brand-gold/10 p-3 pl-7 text-xs text-brand-navy/75">
              {built.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
          <StrategyEditor
            key={JSON.stringify(built.input)}
            initial={built.input}
            onCancel={() => setOpen(false)}
            onDone={() => {
              setOpen(false);
              setSaved(true);
              router.refresh();
            }}
          />
        </div>
      )}
    </div>
  );
}
