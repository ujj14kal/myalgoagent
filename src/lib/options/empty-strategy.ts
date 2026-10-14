import type { OptionStrategyInput } from "@/lib/option-strategy-actions";

// The starting point of a new options strategy. It lives here, not in the editor component: the editor is a client
// component, and a server page that imports a value from one gets an empty stand-in (every field undefined), which
// crashed the New options strategy page.

export const EMPTY_STRATEGY: OptionStrategyInput = {
  name: "NIFTY short straddle",
  underlying: "NIFTY",
  legs: [
    { type: "CE", side: "SELL", offset: 0, lots: 1 },
    { type: "PE", side: "SELL", offset: 0, lots: 1 },
  ],
  expiryRule: "WEEKLY_CURRENT",
  entryMinute: 9 * 60 + 20,
  exitMinute: 15 * 60 + 15,
  weekdays: [1, 2, 3, 4, 5],
  stopLossUnit: "RUPEES",
  stopLossValue: 3000,
  targetUnit: null,
  targetValue: null,
};
