"use client";

import { useState } from "react";
import { ChevronDown, Sparkles } from "lucide-react";
import { NEW_STRATEGY_DRAFT_FROM_KEY, NEW_STRATEGY_DRAFT_KEY } from "@/lib/strategy-draft-key";
import { PRESETS, PRESET_STUDIES, type Preset, type PresetStudy } from "@/lib/strategy/presets";

type InstrumentOption = { id: string; symbol: string; name: string };

const TF_LABEL: Record<string, string> = { "15m": "15-minute candles", "1d": "daily candles" };

/** Turns a recipe into the builder's draft: every rule filled in, on a stock to change, ready to read, preview and save. */
function draftFrom(p: Preset, instrument: InstrumentOption) {
  return {
    name: p.name,
    instrumentId: instrument.id,
    mode: "NO_CODE",
    direction: "LONG",
    entryCondition: p.entry,
    exitCondition: p.exit,
    positionSizingMode: "FULL_CAPITAL",
    positionSizingValue: null,
    stopLoss: { enabled: true, unit: p.stopLoss.unit, value: p.stopLoss.value },
    target: { enabled: false, unit: "PERCENT", value: 5 },
    trailingSl: { enabled: false, unit: "PERCENT", value: 2 },
    maxPyramidEntries: 1,
    timeframe: p.timeframe,
    noEntryAfterMinute: p.noEntryAfterMinute ?? null,
    squareOffMinute: p.squareOffMinute ?? null,
    productType: p.product,
    orderType: "MARKET",
    limitMode: null,
    limitValue: null,
  };
}

/** Ready-made recipes from the analyst studies: an ordinary strategy to open, read, change and test. */
export default function StrategyPresets({ instruments }: { instruments: InstrumentOption[] }) {
  const [open, setOpen] = useState(false);
  const [study, setStudy] = useState<PresetStudy>("RSI");
  const list = PRESETS.filter((p) => p.study === study);

  function use(p: Preset) {
    const stock = instruments.find((i) => i.symbol === "RELIANCE.NS") ?? instruments[0];
    if (!stock) return;
    try {
      sessionStorage.setItem(NEW_STRATEGY_DRAFT_KEY, JSON.stringify(draftFrom(p, stock)));
      sessionStorage.setItem(NEW_STRATEGY_DRAFT_FROM_KEY, "preset");
    } catch {
      return;
    }
    window.location.reload();
  }

  return (
    <section className="mx-auto mb-5 max-w-4xl rounded-2xl border border-brand-navy/10 bg-white">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary">
          <Sparkles size={16} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-brand-navy">Start from a ready-made recipe</span>
          <span className="block text-xs text-brand-navy/55">{PRESETS.length} classic setups from RSI, MACD, Bollinger Bands, VWAP and Fibonacci studies. Each opens as an ordinary strategy you can read, change and backtest.</span>
        </span>
        <ChevronDown size={18} className={`shrink-0 text-brand-navy/40 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="border-t border-brand-navy/10 p-4">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Indicator study">
            {PRESET_STUDIES.map((s) => (
              <button key={s} type="button" role="tab" aria-selected={s === study} onClick={() => setStudy(s)} className={`rounded-full px-3.5 py-1.5 text-sm font-medium ${s === study ? "bg-brand-primary text-white" : "bg-brand-navy/5 text-brand-navy hover:bg-brand-navy/10"}`}>
                {s}
              </button>
            ))}
          </div>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {list.map((p) => (
              <li key={p.id} className="flex flex-col rounded-xl border border-brand-navy/10 p-3.5">
                <p className="text-sm font-semibold text-brand-navy">{p.name}</p>
                <p className="mt-1 flex-1 text-xs leading-relaxed text-brand-navy/65">{p.summary}</p>
                <p className="mt-2 text-[11px] text-brand-navy/45">
                  {TF_LABEL[p.timeframe] ?? p.timeframe} · {p.product === "INTRADAY" ? "Intraday" : "Delivery"} · long only · stop {p.stopLoss.value}
                  {p.stopLoss.unit === "ATR_MULTIPLE" ? "×ATR" : "%"}
                </p>
                <button type="button" onClick={() => use(p)} className="mt-3 self-start rounded-full bg-brand-primary px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-primary-light">
                  Use this recipe
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[11px] leading-relaxed text-brand-navy/45">
            Recipes are starting points to test, not recommendations: they open on RELIANCE so you can change the stock, and results on history never guarantee future results. Indicators are decision aids, not guarantees.
          </p>
        </div>
      )}
    </section>
  );
}
