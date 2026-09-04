import type { PositionSizingMode } from "@/lib/trading-engine/step";

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
