import type { ComparisonOperator, ConditionNode, IndicatorKind, Operand, PriceField } from "./types";

// Ready-made starting points from the analyst studies (RSI, MACD, Bollinger Bands, VWAP, Fibonacci). Each is an ordinary strategy
// the user can open in the builder, read rule by rule, change and test: nothing is hidden and nothing is a recommendation.
// All are long-only; shorting is intraday-only on the platform, so mirrors are left to the user.

const ind = (type: IndicatorKind, ...params: number[]): Operand => ({ kind: "indicator", type, params });
const price = (field: PriceField): Operand => ({ kind: "price", field });
const num = (value: number): Operand => ({ kind: "constant", value });
const cmp = (left: Operand, operator: ComparisonOperator, right: Operand): ConditionNode => ({ kind: "comparison", left, operator, right });
const and = (...children: ConditionNode[]): ConditionNode => ({ kind: "group", op: "AND", children });
const or = (...children: ConditionNode[]): ConditionNode => ({ kind: "group", op: "OR", children });
const recent = (child: ConditionNode, bars: number, mode: "ANY" | "ALL" = "ANY", excludeCurrent = false): ConditionNode => ({ kind: "recent", child, bars, mode, ...(excludeCurrent ? { excludeCurrent } : {}) });
const window = (startMinute: number, endMinute: number): ConditionNode => ({ kind: "signal", signal: { family: "TIME_WINDOW", startMinute, endMinute } });
const flag = (type: IndicatorKind, ...params: number[]) => cmp(ind(type, ...params), "EQ", num(1));

export type PresetStudy = "RSI" | "MACD" | "Bollinger Bands" | "VWAP" | "Fibonacci";

export type Preset = {
  id: string;
  study: PresetStudy;
  name: string;
  /** Plain words: what it does and when it tends to work or fail. */
  summary: string;
  timeframe: string;
  product: "INTRADAY" | "DELIVERY";
  entry: ConditionNode;
  exit: ConditionNode;
  stopLoss: { unit: "PERCENT" | "ATR_MULTIPLE"; value: number };
  /** Optional take-profit as a multiple of the stop distance. */
  targetR?: number;
  /** For intraday presets: no new entries at/after this IST minute, and square-off. */
  noEntryAfterMinute?: number;
  squareOffMinute?: number;
};

const hm = (h: number, m: number) => h * 60 + m;

export const PRESETS: Preset[] = [
  // ----- RSI -----
  {
    id: "rsi-classic-reversal",
    study: "RSI",
    name: "RSI classic reversal (RSI + Bollinger + ADX)",
    summary: "Buys when RSI climbs back above 30 after price recently stretched below the lower Bollinger Band, but only in a range (ADX under 25), and leaves at the middle band or when RSI passes 55. Works best in sideways markets and fails when a strong trend keeps pushing price down.",
    timeframe: "1d",
    product: "DELIVERY",
    entry: and(cmp(ind("RSI", 14), "CROSSES_ABOVE", num(30)), cmp(ind("ADX", 14), "LT", num(25)), recent(cmp(price("CLOSE"), "LT", ind("BB_LOWER", 20, 2)), 5)),
    exit: or(cmp(price("CLOSE"), "GTE", ind("BB_MIDDLE", 20, 2)), cmp(ind("RSI", 14), "GT", num(55))),
    stopLoss: { unit: "ATR_MULTIPLE", value: 1.5 },
  },
  {
    id: "rsi-trend-pullback",
    study: "RSI",
    name: "RSI trend pullback (RSI + EMA)",
    summary: "In an uptrend (price above the 50-day average, itself above the 200-day), buys when RSI dips into the 40–50 zone and turns up. Leaves when RSI reaches 70 or price closes under the 50-day average.",
    timeframe: "1d",
    product: "DELIVERY",
    entry: and(cmp(price("CLOSE"), "GT", ind("EMA", 50)), cmp(ind("EMA", 50), "GT", ind("EMA", 200)), cmp(ind("RSI", 14), "GTE", num(40)), cmp(ind("RSI", 14), "LTE", num(50)), cmp(ind("RSI_CHANGE", 14, 1), "GT", num(0))),
    exit: or(cmp(ind("RSI", 14), "GTE", num(70)), cmp(price("CLOSE"), "CROSSES_BELOW", ind("EMA", 50))),
    stopLoss: { unit: "ATR_MULTIPLE", value: 2 },
  },
  {
    id: "rsi-momentum-confirmation",
    study: "RSI",
    name: "RSI momentum confirmation (RSI + MACD)",
    summary: "Buys when RSI crosses above 50 while the MACD line is above its signal line. Leaves when RSI falls back under 50 or MACD crosses down. A trend-following entry that gives fewer, later signals.",
    timeframe: "1d",
    product: "DELIVERY",
    entry: and(cmp(ind("RSI", 14), "CROSSES_ABOVE", num(50)), cmp(ind("MACD_LINE", 12, 26, 9), "GT", ind("MACD_SIGNAL", 12, 26, 9))),
    exit: or(cmp(ind("RSI", 14), "CROSSES_BELOW", num(50)), cmp(ind("MACD_LINE", 12, 26, 9), "CROSSES_BELOW", ind("MACD_SIGNAL", 12, 26, 9))),
    stopLoss: { unit: "PERCENT", value: 4 },
  },
  {
    id: "rsi-divergence-alert",
    study: "RSI",
    name: "RSI bullish divergence with confirmation",
    summary: "A bullish divergence (price makes a lower low, RSI a higher low) is only a warning. This waits for one in the last 10 candles and then for price to close back above its 20-day average before buying. Divergence is confirmed a few candles after the second low, so it is never early.",
    timeframe: "1d",
    product: "DELIVERY",
    entry: and(recent(flag("RSI_BULL_DIVERGENCE", 14, 5, 5, 60), 10), cmp(price("CLOSE"), "CROSSES_ABOVE", ind("EMA", 20))),
    exit: or(cmp(ind("RSI", 14), "GTE", num(70)), cmp(price("CLOSE"), "CROSSES_BELOW", ind("EMA", 20))),
    stopLoss: { unit: "ATR_MULTIPLE", value: 2 },
  },
  {
    id: "rsi2-dip-buy",
    study: "RSI",
    name: "Short-term dip buy (RSI(2) + 200-day average)",
    summary: "Buys a very short-term dip in an established uptrend: price above its 200-day average and a 2-period RSI under 10. Leaves when RSI(2) passes 65. Wins often but can take an occasional large loss, so it carries a hard 5% stop.",
    timeframe: "1d",
    product: "DELIVERY",
    entry: and(cmp(price("CLOSE"), "GT", ind("SMA", 200)), cmp(ind("RSI", 2), "LT", num(10))),
    exit: cmp(ind("RSI", 2), "GT", num(65)),
    stopLoss: { unit: "PERCENT", value: 5 },
  },

  // ----- MACD -----
  {
    id: "macd-crossover-trend-filter",
    study: "MACD",
    name: "MACD crossover with a trend filter",
    summary: "Buys when the MACD line crosses above its signal line while still below zero (a pullback), only when price is above the 200-day average. Leaves on the opposite cross. The trend filter cuts the false crosses MACD gives in sideways markets.",
    timeframe: "1d",
    product: "DELIVERY",
    entry: and(cmp(price("CLOSE"), "GT", ind("EMA", 200)), cmp(ind("MACD_LINE", 12, 26, 9), "CROSSES_ABOVE", ind("MACD_SIGNAL", 12, 26, 9)), cmp(ind("MACD_LINE", 12, 26, 9), "LT", num(0))),
    exit: cmp(ind("MACD_LINE", 12, 26, 9), "CROSSES_BELOW", ind("MACD_SIGNAL", 12, 26, 9)),
    stopLoss: { unit: "ATR_MULTIPLE", value: 1.5 },
  },
  {
    id: "macd-rsi-confirmation",
    study: "MACD",
    name: "MACD + RSI confirmation",
    summary: "Buys when the MACD line is above its signal line and RSI crosses above 50 (or climbs back out of oversold). Leaves when RSI turns down from above 70 or MACD crosses down.",
    timeframe: "1d",
    product: "DELIVERY",
    entry: and(cmp(ind("MACD_LINE", 12, 26, 9), "GT", ind("MACD_SIGNAL", 12, 26, 9)), or(cmp(ind("RSI", 14), "CROSSES_ABOVE", num(50)), cmp(ind("RSI", 14), "CROSSES_ABOVE", num(30)))),
    exit: or(cmp(ind("MACD_LINE", 12, 26, 9), "CROSSES_BELOW", ind("MACD_SIGNAL", 12, 26, 9)), cmp(ind("RSI", 14), "CROSSES_BELOW", num(70))),
    stopLoss: { unit: "PERCENT", value: 4 },
  },
  {
    id: "macd-histogram-reversal",
    study: "MACD",
    name: "MACD histogram reversal (early entry)",
    summary: "Acts before the crossover: buys when the MACD histogram is still negative but has risen for three candles in a row. It is earlier and so riskier: it carries a tighter 1.5×ATR stop. Add a support or Fibonacci-zone rule in the builder for fewer, better trades.",
    timeframe: "1d",
    product: "DELIVERY",
    entry: and(cmp(ind("MACD_HISTOGRAM", 12, 26, 9), "LT", num(0)), recent(cmp(ind("MACD_HIST_CHANGE", 12, 26, 9, 1), "GT", num(0)), 3, "ALL")),
    exit: cmp(ind("MACD_LINE", 12, 26, 9), "CROSSES_BELOW", ind("MACD_SIGNAL", 12, 26, 9)),
    stopLoss: { unit: "ATR_MULTIPLE", value: 1.5 },
  },
  {
    id: "macd-zero-line-trend",
    study: "MACD",
    name: "MACD zero-line trend follower",
    summary: "Buys when the MACD line crosses above zero with a strong trend (ADX over 25) and holds until it crosses back below zero. Fewer trades and longer holds, with a lower win rate and larger winners.",
    timeframe: "1d",
    product: "DELIVERY",
    entry: and(cmp(ind("MACD_LINE", 12, 26, 9), "CROSSES_ABOVE", num(0)), cmp(ind("ADX", 14), "GT", num(25))),
    exit: cmp(ind("MACD_LINE", 12, 26, 9), "CROSSES_BELOW", num(0)),
    stopLoss: { unit: "ATR_MULTIPLE", value: 2 },
  },
  {
    id: "macd-divergence-alert",
    study: "MACD",
    name: "MACD bullish divergence with a signal cross",
    summary: "Waits for a bullish MACD divergence in the last 10 candles, then buys on a MACD signal-line cross up. Divergence alone can persist for a long time, so the cross is the trigger.",
    timeframe: "1d",
    product: "DELIVERY",
    entry: and(recent(flag("MACD_BULL_DIVERGENCE", 12, 26, 9, 5, 5, 60), 10), cmp(ind("MACD_LINE", 12, 26, 9), "CROSSES_ABOVE", ind("MACD_SIGNAL", 12, 26, 9))),
    exit: cmp(ind("MACD_LINE", 12, 26, 9), "CROSSES_BELOW", ind("MACD_SIGNAL", 12, 26, 9)),
    stopLoss: { unit: "ATR_MULTIPLE", value: 2 },
  },

  // ----- Bollinger Bands -----
  {
    id: "bb-mean-reversion",
    study: "Bollinger Bands",
    name: "Bollinger mean reversion (Bollinger + RSI + ADX)",
    summary: "In a range (ADX under 25), buys when price closes back above the lower band while RSI is under 40 and turning up. Leaves at the middle band or when RSI passes 55. Fails in strong trends where price keeps hugging the band.",
    timeframe: "1d",
    product: "DELIVERY",
    entry: and(cmp(price("CLOSE"), "CROSSES_ABOVE", ind("BB_LOWER", 20, 2)), cmp(ind("RSI", 14), "LT", num(40)), cmp(ind("RSI_CHANGE", 14, 1), "GT", num(0)), cmp(ind("ADX", 14), "LT", num(25))),
    exit: or(cmp(price("CLOSE"), "GTE", ind("BB_MIDDLE", 20, 2)), cmp(ind("RSI", 14), "GT", num(55))),
    stopLoss: { unit: "ATR_MULTIPLE", value: 1.5 },
  },
  {
    id: "bb-squeeze-breakout",
    study: "Bollinger Bands",
    name: "Bollinger squeeze breakout",
    summary: "After the bands have been among the narrowest of the last 120 candles, buys the first close above the upper band while the MACD histogram is positive. Leaves when price closes under the middle band. A squeeze shows quiet before a bigger move but not its direction, so the breakout close is the trigger.",
    timeframe: "1d",
    product: "DELIVERY",
    entry: and(recent(flag("BB_SQUEEZE", 20, 2, 120, 15), 5, "ANY", true), cmp(price("CLOSE"), "CROSSES_ABOVE", ind("BB_UPPER", 20, 2)), cmp(ind("MACD_HISTOGRAM", 12, 26, 9), "GT", num(0))),
    exit: cmp(price("CLOSE"), "CROSSES_BELOW", ind("BB_MIDDLE", 20, 2)),
    stopLoss: { unit: "ATR_MULTIPLE", value: 2 },
  },
  {
    id: "bb-trend-pullback",
    study: "Bollinger Bands",
    name: "Bollinger trend pullback (Bollinger + EMA + RSI)",
    summary: "In an uptrend (price above the 200-day average and the middle band rising), buys when price dips to the middle band and closes back above it with RSI between 40 and 50 and turning up. Leaves at the upper band.",
    timeframe: "1d",
    product: "DELIVERY",
    entry: and(cmp(price("CLOSE"), "GT", ind("EMA", 200)), cmp(ind("BB_MIDDLE_CHANGE", 20, 3), "GT", num(0)), cmp(price("LOW"), "LTE", ind("BB_MIDDLE", 20, 2)), cmp(price("CLOSE"), "GT", ind("BB_MIDDLE", 20, 2)), cmp(ind("RSI", 14), "GTE", num(40)), cmp(ind("RSI", 14), "LTE", num(50)), cmp(ind("RSI_CHANGE", 14, 1), "GT", num(0))),
    exit: cmp(price("HIGH"), "GTE", ind("BB_UPPER", 20, 2)),
    stopLoss: { unit: "ATR_MULTIPLE", value: 2 },
  },
  {
    id: "bb-w-bottom",
    study: "Bollinger Bands",
    name: "Bollinger W-bottom",
    summary: "Buys when Bollinger's own W-bottom is confirmed: a first low at the lower band, then a higher second low that stays inside the band. Leaves at the upper band or when price falls back under the middle band after reaching it.",
    timeframe: "1d",
    product: "DELIVERY",
    entry: flag("BB_W_BOTTOM", 20, 2, 5, 5, 60),
    exit: cmp(price("HIGH"), "GTE", ind("BB_UPPER", 20, 2)),
    stopLoss: { unit: "ATR_MULTIPLE", value: 2 },
  },

  // ----- VWAP (intraday) -----
  {
    id: "vwap-trend-pullback",
    study: "VWAP",
    name: "VWAP trend pullback",
    summary: "Intraday: price and the 20-period average are above VWAP; buys when a candle dips to VWAP and closes back above it as a green candle, between 9:45 and 14:45. Leaves when price closes under VWAP or reaches the +1 SD band. Skips the first 30 minutes and the last hour on purpose.",
    timeframe: "15m",
    product: "INTRADAY",
    entry: and(cmp(price("CLOSE"), "GT", ind("VWAP")), cmp(ind("EMA", 20), "GT", ind("VWAP")), cmp(price("LOW"), "LTE", ind("VWAP")), cmp(price("CLOSE"), "GT", price("OPEN")), window(hm(9, 45), hm(14, 45))),
    exit: or(cmp(price("CLOSE"), "CROSSES_BELOW", ind("VWAP")), cmp(price("HIGH"), "GTE", ind("VWAP_UPPER_1"))),
    stopLoss: { unit: "ATR_MULTIPLE", value: 1.5 },
    noEntryAfterMinute: hm(14, 45),
    squareOffMinute: hm(15, 15),
  },
  {
    id: "vwap-band-mean-reversion",
    study: "VWAP",
    name: "VWAP band mean reversion",
    summary: "Intraday on a range day (ADX under 25): buys when price closes back inside after being under the lower 2 SD band, and leaves at VWAP or the +1 SD band. Poor on strong trend days, when price can ride the outer bands.",
    timeframe: "15m",
    product: "INTRADAY",
    entry: and(cmp(price("CLOSE"), "CROSSES_ABOVE", ind("VWAP_LOWER_2")), cmp(ind("ADX", 14), "LT", num(25)), window(hm(9, 45), hm(14, 45))),
    exit: or(cmp(price("CLOSE"), "GTE", ind("VWAP")), cmp(price("HIGH"), "GTE", ind("VWAP_UPPER_1"))),
    stopLoss: { unit: "ATR_MULTIPLE", value: 2 },
    noEntryAfterMinute: hm(14, 45),
    squareOffMinute: hm(15, 15),
  },
  {
    id: "vwap-reclaim-with-volume",
    study: "VWAP",
    name: "VWAP reclaim with volume",
    summary: "Intraday: buys when price closes back above VWAP on a volume spike (twice the average). Leaves when it closes under VWAP again. The stop sits under the entry at 1.5×ATR.",
    timeframe: "15m",
    product: "INTRADAY",
    entry: and(cmp(price("CLOSE"), "CROSSES_ABOVE", ind("VWAP")), { kind: "signal", signal: { family: "VOLUME_PATTERN", pattern: "VOLUME_SPIKE" } }, window(hm(9, 45), hm(14, 45))),
    exit: cmp(price("CLOSE"), "CROSSES_BELOW", ind("VWAP")),
    stopLoss: { unit: "ATR_MULTIPLE", value: 1.5 },
    noEntryAfterMinute: hm(14, 45),
    squareOffMinute: hm(15, 15),
  },
  {
    id: "orb-vwap",
    study: "VWAP",
    name: "Opening-range breakout with VWAP",
    summary: "Intraday: buys the first close above the high of the first 15 minutes after the open, only when price is above VWAP and the candle comes on a volume spike. Leaves when price closes under VWAP. A breakout on the right side of VWAP is considered higher quality; false breakouts are common, so it carries a 1.5×ATR stop.",
    timeframe: "15m",
    product: "INTRADAY",
    entry: and(cmp(price("CLOSE"), "CROSSES_ABOVE", ind("OPENING_RANGE_HIGH", 15)), cmp(price("CLOSE"), "GT", ind("VWAP")), { kind: "signal", signal: { family: "VOLUME_PATTERN", pattern: "VOLUME_SPIKE" } }, window(hm(9, 30), hm(14, 45))),
    exit: cmp(price("CLOSE"), "CROSSES_BELOW", ind("VWAP")),
    stopLoss: { unit: "ATR_MULTIPLE", value: 1.5 },
    noEntryAfterMinute: hm(14, 45),
    squareOffMinute: hm(15, 15),
  },
  {
    id: "vwap-swing-anchored",
    study: "VWAP",
    name: "Anchored VWAP swing pullback",
    summary: "Swing: in an uptrend (price above the 200-day average), buys a dip to the VWAP anchored at the latest swing low and a close back above it. Leaves when price closes under that line. The anchored VWAP is the average cost of everyone who bought since the low.",
    timeframe: "1d",
    product: "DELIVERY",
    entry: and(cmp(price("CLOSE"), "GT", ind("EMA", 200)), cmp(price("LOW"), "LTE", ind("VWAP_SWING_LOW", 5, 5)), cmp(price("CLOSE"), "GT", ind("VWAP_SWING_LOW", 5, 5))),
    exit: cmp(price("CLOSE"), "CROSSES_BELOW", ind("VWAP_SWING_LOW", 5, 5)),
    stopLoss: { unit: "ATR_MULTIPLE", value: 2 },
  },

  // ----- Fibonacci -----
  {
    id: "fib-golden-zone-pullback",
    study: "Fibonacci",
    name: "Fibonacci golden-zone pullback",
    summary: "In an uptrend, after an up-swing, buys when price pulls back into the 50–61.8% zone and a green candle closes there with RSI turning up. Targets the 1.272 extension. Swings are only used once confirmed, so nothing repaints. Fibonacci gives the location; the candle and RSI are the trigger.",
    timeframe: "1d",
    product: "DELIVERY",
    entry: and(cmp(price("CLOSE"), "GT", ind("EMA", 200)), flag("FIB_DIRECTION", 5, 5, 3), flag("FIB_GOLDEN_ZONE", 5, 5, 3), cmp(price("CLOSE"), "GT", price("OPEN")), cmp(ind("RSI_CHANGE", 14, 1), "GT", num(0))),
    exit: cmp(price("HIGH"), "GTE", ind("FIB_EXT_1272", 5, 5, 3)),
    stopLoss: { unit: "ATR_MULTIPLE", value: 1.5 },
  },
  {
    id: "fib-macd-confirmation",
    study: "Fibonacci",
    name: "Fibonacci + MACD confirmation",
    summary: "Buys when price was in the golden zone within the last 3 candles and the MACD histogram turns up from negative (or MACD crosses above its signal). Leaves on an opposite MACD cross or at the swing high's 1.272 extension.",
    timeframe: "1d",
    product: "DELIVERY",
    entry: and(recent(flag("FIB_GOLDEN_ZONE", 5, 5, 3), 3), flag("FIB_DIRECTION", 5, 5, 3), or(cmp(ind("MACD_LINE", 12, 26, 9), "CROSSES_ABOVE", ind("MACD_SIGNAL", 12, 26, 9)), and(cmp(ind("MACD_HISTOGRAM", 12, 26, 9), "LT", num(0)), cmp(ind("MACD_HIST_CHANGE", 12, 26, 9, 1), "GT", num(0))))),
    exit: or(cmp(ind("MACD_LINE", 12, 26, 9), "CROSSES_BELOW", ind("MACD_SIGNAL", 12, 26, 9)), cmp(price("HIGH"), "GTE", ind("FIB_EXT_1272", 5, 5, 3))),
    stopLoss: { unit: "ATR_MULTIPLE", value: 1.5 },
  },
  {
    id: "fib-confluence-zone",
    study: "Fibonacci",
    name: "Fibonacci confluence zone",
    summary: "Only trades where levels from two or more of the last three swings sit together (a cluster) and a green candle with RSI turning up closes there. Higher-quality signals and fewer trades. Targets the 1.272 extension.",
    timeframe: "1d",
    product: "DELIVERY",
    entry: and(flag("FIB_CONFLUENCE", 5, 5, 3), cmp(price("CLOSE"), "GT", price("OPEN")), cmp(ind("RSI_CHANGE", 14, 1), "GT", num(0))),
    exit: cmp(price("HIGH"), "GTE", ind("FIB_EXT_1272", 5, 5, 3)),
    stopLoss: { unit: "ATR_MULTIPLE", value: 1.5 },
  },
  {
    id: "fib-vwap-intraday",
    study: "Fibonacci",
    name: "Intraday Fibonacci + VWAP",
    summary: "Intraday: buys when price is in the golden zone of an intraday swing, above VWAP, on a green candle. Leaves at VWAP's +1 SD band or when price closes under VWAP. Swings formed in the first half hour are unstable, so entries start at 9:45.",
    timeframe: "15m",
    product: "INTRADAY",
    entry: and(flag("FIB_DIRECTION", 5, 5, 3), flag("FIB_GOLDEN_ZONE", 5, 5, 3), cmp(price("CLOSE"), "GT", ind("VWAP")), cmp(price("CLOSE"), "GT", price("OPEN")), window(hm(9, 45), hm(14, 45))),
    exit: or(cmp(price("HIGH"), "GTE", ind("VWAP_UPPER_1")), cmp(price("CLOSE"), "CROSSES_BELOW", ind("VWAP"))),
    stopLoss: { unit: "ATR_MULTIPLE", value: 1.5 },
    noEntryAfterMinute: hm(14, 45),
    squareOffMinute: hm(15, 15),
  },
];

export const PRESET_STUDIES: PresetStudy[] = ["RSI", "MACD", "Bollinger Bands", "VWAP", "Fibonacci"];
