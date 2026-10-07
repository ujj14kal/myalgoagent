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

export default function StrategyFromLegs({ legs, underlying, step, atmStrike, expiries, expiry, onRebuild }: { legs: OptionLeg[]; underlying: string; step: number; /** The chain's at-the-money strike. */ atmStrike: number; expiries: string[]; expiry: string | null; /** Rebuild the template position around the current spot. */ onRebuild?: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const atm = atmStrike;
  const built = useMemo(() => strategyFromLegs({ legs, underlying, step, atm, expiries, expiry }), [legs, underlying, step, atm, expiries, expiry]);

  return (
    <div className="mt-5 rounded-xl border border-brand-navy/10 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-brand-navy">Make these legs a strategy</p>
          <p className="text-xs text-brand-navy/50">Save the position you built as an options strategy — to backtest on real option prices and forward test where that feed is enabled for your account. Strikes are kept as “N strikes from at-the-money”, so it re-picks them each day.</p>
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
            See it in your options strategies →
          </Link>
        </p>
      )}
      {open && (
        <div className="mt-4">
          {built.tooFar.length > 0 ? (
            <div className="rounded-lg bg-brand-sell/[0.07] p-3 text-sm text-brand-sell">
              <p className="font-semibold">These legs are too far from the money to save as a strategy.</p>
              <p className="mt-1 text-xs">
                A strategy keeps each strike as “up to {10} strikes from at-the-money ({atm.toLocaleString("en-IN")} now)”, but {built.tooFar.map((k) => k.toLocaleString("en-IN")).join(", ")} {built.tooFar.length === 1 ? "is" : "are"} further out. Move {built.tooFar.length === 1 ? "that strike" : "those strikes"} closer
                {onRebuild ? (
                  <>
                    , or{" "}
                    <button type="button" onClick={onRebuild} className="font-semibold underline">
                      rebuild the position around today&apos;s price
                    </button>
                  </>
                ) : null}
                .
              </p>
            </div>
          ) : (
            <>
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
            </>
          )}
        </div>
      )}
    </div>
  );
}
