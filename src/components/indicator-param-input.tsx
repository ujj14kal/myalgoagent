"use client";

import type { IndicatorDef } from "@/lib/strategy/indicator-catalog";

/** One setting of an indicator: a number box, or a dropdown when the setting is a pick from a short list (source, smoothing…). */
export default function IndicatorParamInput({
  def,
  index,
  value,
  onChange,
  className,
}: {
  def: IndicatorDef;
  index: number;
  /** The saved value; missing for older strategies, which then use the default. */
  value: number | undefined;
  onChange: (value: number) => void;
  className: string;
}) {
  const label = def.paramLabels[index];
  const current = Number.isFinite(value) ? (value as number) : def.defaults[index];
  const choices = def.options?.[index];
  if (choices) {
    return (
      <select value={current} onChange={(e) => onChange(Number(e.target.value))} className={`${className} w-auto max-w-[11rem]`} aria-label={label} title={label}>
        {choices.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }
  const max = def.maxes?.[index] ?? 500;
  return (
    <input
      type="number"
      min={0}
      max={max}
      step="any"
      value={current}
      onChange={(e) => onChange(Number(e.target.value))}
      className={`${className} ${max > 100_000 ? "w-28" : "w-16"}`}
      aria-label={label}
      title={label}
    />
  );
}
