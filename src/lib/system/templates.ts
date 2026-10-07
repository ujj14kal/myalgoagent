import type { ConditionNode } from "@/lib/strategy/types";

// Starting points for the Block Builder. Each is an ordinary rule the user then tunes (swing size, levels, times);
// none of them carries an instrument, a side to trade, a size or an exit — those belong to the trading system.

export interface BlockTemplate {
  key: string;
  name: string;
  about: string;
  condition: ConditionNode;
}

const smc = (pattern: string, side: "BULLISH" | "BEARISH" = "BULLISH"): ConditionNode => ({ kind: "signal", signal: { family: "SMC", pattern, side } as never });

export const BLOCK_TEMPLATES: BlockTemplate[] = [
  { key: "bos", name: "My BOS", about: "Break of structure: a close beyond the last confirmed swing.", condition: smc("BOS") },
  { key: "choch", name: "My CHoCH", about: "Change of character: the first break against the trend so far.", condition: smc("CHOCH") },
  { key: "fvg", name: "My FVG", about: "Fair value gap: a three-candle imbalance.", condition: smc("FVG") },
  { key: "fvg-retest", name: "My FVG retest", about: "Price comes back into an open fair value gap.", condition: smc("FVG_RETEST") },
  { key: "ob", name: "My order block", about: "Price returns to the last opposite candle before a break.", condition: smc("ORDER_BLOCK_RETEST") },
  { key: "sweep", name: "My liquidity sweep", about: "A wick through a swing level that closes back inside.", condition: smc("LIQUIDITY_SWEEP") },
  {
    key: "level",
    name: "Above my level",
    about: "Price crosses above a horizontal level you set.",
    condition: { kind: "comparison", left: { kind: "price", field: "CLOSE" }, operator: "CROSSES_ABOVE", right: { kind: "constant", value: 100 } },
  },
  {
    key: "zone",
    name: "In my demand zone",
    about: "Price inside a support/resistance zone you set.",
    condition: {
      kind: "group",
      op: "AND",
      children: [
        { kind: "comparison", left: { kind: "price", field: "LOW" }, operator: "LTE", right: { kind: "constant", value: 105 } },
        { kind: "comparison", left: { kind: "price", field: "CLOSE" }, operator: "GTE", right: { kind: "constant", value: 100 } },
      ],
    },
  },
  {
    key: "support",
    name: "At support",
    about: "Price at a detected support level.",
    condition: { kind: "comparison", left: { kind: "price", field: "LOW" }, operator: "LTE", right: { kind: "indicator", type: "SUPPORT", params: [5, 2, 1] } },
  },
  { key: "session", name: "Morning session", about: "Only between 09:15 and 11:00 IST.", condition: { kind: "signal", signal: { family: "TIME_WINDOW", startMinute: 555, endMinute: 660 } } },
  { key: "volume", name: "Volume spike", about: "Volume well above its recent average.", condition: { kind: "signal", signal: { family: "VOLUME_PATTERN", pattern: "VOLUME_SPIKE" } } },
  {
    key: "ma",
    name: "Above the 50 EMA",
    about: "Close above its 50-period moving average.",
    condition: { kind: "comparison", left: { kind: "price", field: "CLOSE" }, operator: "GT", right: { kind: "indicator", type: "EMA", params: [50] } },
  },
];

/** A blank block: one AND group with a single rule to change. */
export const BLANK_BLOCK_CONDITION: ConditionNode = {
  kind: "group",
  op: "AND",
  children: [{ kind: "comparison", left: { kind: "price", field: "CLOSE" }, operator: "GT", right: { kind: "indicator", type: "SMA", params: [20] } }],
};
