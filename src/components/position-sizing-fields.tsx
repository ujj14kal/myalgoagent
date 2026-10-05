"use client";

import type { PositionSizingMode } from "@/lib/trading-engine/step";

// How much to buy or sell on each entry. Quantity comes first — it's how most
// traders think about an order ("buy 25 shares").
const MODES: { value: PositionSizingMode; label: string; hint: string }[] = [
  { value: "FIXED_QUANTITY", label: "Quantity", hint: "A fixed number of shares every trade." },
  { value: "FIXED_CAPITAL", label: "Amount (₹)", hint: "A fixed rupee amount every trade — the number of shares follows the price." },
  { value: "PERCENT_OF_CAPITAL", label: "% of capital", hint: "A share of the account's current capital every trade." },
  { value: "RISK_PERCENT", label: "Risk per trade (%)", hint: "Risk a set share of your capital on each trade: the number of shares is worked out from your stop-loss distance, so a wider stop means fewer shares. Needs a stop-loss." },
  { value: "FULL_CAPITAL", label: "Full capital", hint: "All available capital every trade." },
];

const VALUE_CONFIG: Record<PositionSizingMode, { label: string; placeholder: string; step: number; suffix: string } | null> = {
  FULL_CAPITAL: null,
  FIXED_QUANTITY: { label: "Shares per trade", placeholder: "e.g. 10", step: 1, suffix: "shares" },
  FIXED_CAPITAL: { label: "Amount per trade", placeholder: "e.g. 20000", step: 100, suffix: "₹" },
  PERCENT_OF_CAPITAL: { label: "Share of capital per trade", placeholder: "e.g. 25", step: 1, suffix: "%" },
  RISK_PERCENT: { label: "Capital risked per trade", placeholder: "e.g. 1", step: 0.25, suffix: "%" },
};

const DEFAULT_VALUE: Record<PositionSizingMode, number | null> = {
  FULL_CAPITAL: null,
  FIXED_QUANTITY: 1,
  FIXED_CAPITAL: 10000,
  PERCENT_OF_CAPITAL: 25,
  RISK_PERCENT: 1,
};

export default function PositionSizingFields({
  mode,
  value,
  onModeChange,
  onValueChange,
}: {
  mode: PositionSizingMode;
  value: number | null;
  onModeChange: (mode: PositionSizingMode) => void;
  onValueChange: (value: number | null) => void;
}) {
  const valueConfig = VALUE_CONFIG[mode];
  const active = MODES.find((m) => m.value === mode);

  return (
    <div>
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-navy/40">Position size</label>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Position size">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={mode === m.value}
            onClick={() => {
              if (m.value === mode) return;
              onModeChange(m.value);
              onValueChange(DEFAULT_VALUE[m.value]);
            }}
            className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              mode === m.value ? "border-brand-primary bg-brand-primary text-white" : "border-brand-navy/15 text-brand-navy/60 hover:border-brand-primary"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
      {valueConfig && (
        <div className="mt-2.5 flex max-w-xs items-center gap-2">
          <input
            type="number"
            min={0}
            step={valueConfig.step}
            placeholder={valueConfig.placeholder}
            value={value ?? ""}
            aria-label={valueConfig.label}
            onChange={(e) => onValueChange(e.target.value ? Number(e.target.value) : null)}
            className="w-full rounded-lg border border-brand-navy/15 px-3 py-2 text-sm outline-none focus:border-brand-primary"
          />
          <span className="shrink-0 text-sm text-brand-navy/50">{valueConfig.suffix}</span>
        </div>
      )}
      {active && <p className="mt-1.5 text-xs text-brand-navy/40">{active.hint}</p>}
    </div>
  );
}
