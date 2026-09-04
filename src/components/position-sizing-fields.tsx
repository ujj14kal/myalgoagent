"use client";

import type { PositionSizingMode } from "@/lib/trading-engine/step";

const MODES: { value: PositionSizingMode; label: string }[] = [
  { value: "FULL_CAPITAL", label: "Full capital per trade" },
  { value: "FIXED_QUANTITY", label: "Fixed quantity" },
  { value: "FIXED_CAPITAL", label: "Fixed capital (₹)" },
  { value: "PERCENT_OF_CAPITAL", label: "% of capital" },
];

const VALUE_CONFIG: Record<PositionSizingMode, { label: string; placeholder: string; step: number } | null> = {
  FULL_CAPITAL: null,
  FIXED_QUANTITY: { label: "Shares per trade", placeholder: "e.g. 10", step: 1 },
  FIXED_CAPITAL: { label: "₹ per trade", placeholder: "e.g. 20000", step: 100 },
  PERCENT_OF_CAPITAL: { label: "% per trade", placeholder: "e.g. 25", step: 1 },
};

export function describePositionSizing(mode: PositionSizingMode, value: number | null): string {
  switch (mode) {
    case "FIXED_QUANTITY":
      return `${value ?? "?"} shares per trade`;
    case "FIXED_CAPITAL":
      return `₹${(value ?? 0).toLocaleString("en-IN")} per trade`;
    case "PERCENT_OF_CAPITAL":
      return `${value ?? "?"}% of capital per trade`;
    case "FULL_CAPITAL":
    default:
      return "Full capital per trade";
  }
}

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

  return (
    <>
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-navy/40">Position sizing</label>
        <select
          value={mode}
          onChange={(e) => {
            const nextMode = e.target.value as PositionSizingMode;
            onModeChange(nextMode);
            if (nextMode === "FULL_CAPITAL") onValueChange(null);
          }}
          className="w-full rounded-lg border border-brand-navy/15 px-3 py-2 text-sm outline-none focus:border-brand-primary"
        >
          {MODES.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </div>
      {valueConfig && (
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-navy/40">{valueConfig.label}</label>
          <input
            type="number"
            min={0}
            step={valueConfig.step}
            placeholder={valueConfig.placeholder}
            value={value ?? ""}
            onChange={(e) => onValueChange(e.target.value ? Number(e.target.value) : null)}
            className="w-full rounded-lg border border-brand-navy/15 px-3 py-2 text-sm outline-none focus:border-brand-primary"
          />
        </div>
      )}
    </>
  );
}
