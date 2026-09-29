"use client";

import { useEffect, useState } from "react";
import StrategyBuilderForm, { NEW_STRATEGY_DRAFT_KEY, type StrategyInitial } from "@/components/strategy-builder-form";
import type { StrategyInput } from "@/lib/strategy-actions";
import { NEVER_EXIT_CONDITION } from "@/lib/strategy/types";

type InstrumentOption = { id: string; symbol: string; name: string };

/** The kept draft (see the builder) as the form's starting values. */
function toInitial(d: StrategyInput): StrategyInitial | null {
  if (!d || typeof d !== "object" || !d.instrumentId || !d.stopLoss) return null;
  return {
    name: d.name ?? "",
    instrumentId: d.instrumentId,
    mode: d.mode,
    direction: d.direction,
    entryCondition: d.entryCondition ?? { kind: "comparison", left: { kind: "indicator", type: "SMA", params: [20] }, operator: "CROSSES_ABOVE", right: { kind: "indicator", type: "EMA", params: [50] } },
    exitCondition: d.exitCondition ?? NEVER_EXIT_CONDITION,
    entrySource: d.entrySource ?? null,
    exitSource: d.exitSource ?? null,
    positionSizingMode: d.positionSizingMode,
    positionSizingValue: d.positionSizingValue,
    stopLossEnabled: d.stopLoss.enabled,
    stopLossUnit: d.stopLoss.unit,
    stopLossValue: d.stopLoss.value,
    targetEnabled: d.target.enabled,
    targetUnit: d.target.unit,
    targetValue: d.target.value,
    trailingSlEnabled: d.trailingSl.enabled,
    trailingSlUnit: d.trailingSl.unit,
    trailingSlValue: d.trailingSl.value,
    maxPyramidEntries: d.maxPyramidEntries,
    timeframe: d.timeframe,
    noEntryAfterMinute: d.noEntryAfterMinute,
    squareOffMinute: d.squareOffMinute,
    productType: d.productType,
    orderType: d.orderType,
    limitMode: d.limitMode,
    limitValue: d.limitValue,
  };
}

/** New Strategy: restores an unsaved strategy kept in this tab (e.g. after a reload), with a way to start fresh. */
export default function NewStrategyWithDraft({ instruments }: { instruments: InstrumentOption[] }) {
  const [draft, setDraft] = useState<StrategyInitial | null>(null);
  const [key, setKey] = useState(0);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(NEW_STRATEGY_DRAFT_KEY);
      const d = raw ? toInitial(JSON.parse(raw) as StrategyInput) : null;
      // The instrument must still exist, or the draft can't be shown faithfully.
      if (d && instruments.some((i) => i.id === d.instrumentId)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring browser-kept state after mount (not available during render)
        setDraft(d);
        setKey((k) => k + 1);
      }
    } catch {
      // unreadable draft — start fresh
    }
  }, [instruments]);

  return (
    <>
      {draft && (
        <p className="mx-auto mb-3 flex max-w-4xl flex-wrap items-center gap-2 rounded-xl bg-brand-primary/[0.06] px-4 py-2.5 text-sm text-brand-navy/75">
          Restored the strategy you were building.
          <button
            type="button"
            onClick={() => {
              try {
                sessionStorage.removeItem(NEW_STRATEGY_DRAFT_KEY);
              } catch {}
              setDraft(null);
              setKey((k) => k + 1);
            }}
            className="font-semibold text-brand-primary hover:underline"
          >
            Start fresh
          </button>
        </p>
      )}
      <StrategyBuilderForm key={key} instruments={instruments} initial={draft ?? undefined} />
    </>
  );
}
