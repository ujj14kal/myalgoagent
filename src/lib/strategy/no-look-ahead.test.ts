import { describe, it, expect } from "vitest";
import { evaluateConditionsPerBar } from "@/lib/strategy/evaluate";
import { computeChartPatternSeries } from "@/lib/chart-patterns";
import { computeCandlePatternSeries } from "@/lib/candle-patterns";
import type { Candle } from "@/lib/market-data";
import type { ConditionNode } from "@/lib/strategy/types";

/**
 * These tests verify a structural, no-look-ahead PROPERTY of the signal
 * pipeline: a signal computed for bar `i` must never change when bars after
 * `i` are added or removed. This is deliberately checked with synthetic
 * (seeded, reproducible) candle data rather than real market data, and that
 * is the correct choice here — unlike the pattern-*definition* tests
 * elsewhere in this codebase (where synthetic fixtures previously produced
 * false negatives because a hand-built candle didn't actually match real
 * market pattern geometry), this property holds regardless of what the
 * candles represent. It is a claim about the algorithm's computation order,
 * not about whether any specific pattern occurred.
 *
 * Method: evaluate the full series once, then evaluate a truncated prefix
 * of the same series, and assert every bar present in both runs produced
 * the identical result. If truncating the future changes the past, the
 * pipeline is leaking future information.
 */

// Deterministic PRNG (mulberry32) — no external dependency, reproducible
// across runs and CI, unlike Math.random().
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateCandles(count: number, seed = 42): Candle[] {
  const rand = mulberry32(seed);
  const candles: Candle[] = [];
  let price = 1000;
  const startTime = 1_700_000_000;
  for (let i = 0; i < count; i++) {
    const open = price;
    // A mild random walk with occasional larger moves, bounded so OHLC
    // relationships stay internally consistent (high >= max(open,close),
    // low <= min(open,close)).
    const drift = (rand() - 0.5) * 0.03;
    const close = open * (1 + drift);
    const wick = Math.abs(open - close) * (0.5 + rand());
    const high = Math.max(open, close) + wick * rand();
    const low = Math.min(open, close) - wick * rand();
    const volume = Math.floor(1000 + rand() * 9000);
    candles.push({ time: startTime + i * 86400, open, high, low, close, volume });
    price = close;
  }
  return candles;
}

const FULL_LENGTH = 300;
const TRUNCATE_AT = 150;

describe("no-look-ahead: evaluateConditionsPerBar (indicator conditions)", () => {
  const entryCondition: ConditionNode = {
    kind: "comparison",
    left: { kind: "indicator", type: "SMA", params: [10] },
    operator: "CROSSES_ABOVE",
    right: { kind: "indicator", type: "EMA", params: [20] },
  };
  const exitCondition: ConditionNode = {
    kind: "comparison",
    left: { kind: "indicator", type: "SMA", params: [10] },
    operator: "CROSSES_BELOW",
    right: { kind: "indicator", type: "EMA", params: [20] },
  };

  it("produces identical entry/exit signals for bars present in both a full and a truncated run", () => {
    const full = generateCandles(FULL_LENGTH);
    const truncated = full.slice(0, TRUNCATE_AT);

    const fullResult = evaluateConditionsPerBar(full, entryCondition, exitCondition);
    const truncatedResult = evaluateConditionsPerBar(truncated, entryCondition, exitCondition);

    expect(truncatedResult.entry).toEqual(fullResult.entry.slice(0, TRUNCATE_AT));
    expect(truncatedResult.exit).toEqual(fullResult.exit.slice(0, TRUNCATE_AT));
  });

  it("changing a future bar's values does not change any earlier signal", () => {
    const base = generateCandles(FULL_LENGTH);
    const mutated = base.map((c, i) =>
      i >= TRUNCATE_AT ? { ...c, close: c.close * 1.5, high: c.high * 1.5, low: c.low * 0.7 } : c,
    );

    const baseResult = evaluateConditionsPerBar(base, entryCondition, exitCondition);
    const mutatedResult = evaluateConditionsPerBar(mutated, entryCondition, exitCondition);

    expect(mutatedResult.entry.slice(0, TRUNCATE_AT)).toEqual(baseResult.entry.slice(0, TRUNCATE_AT));
    expect(mutatedResult.exit.slice(0, TRUNCATE_AT)).toEqual(baseResult.exit.slice(0, TRUNCATE_AT));
  });
});

describe("no-look-ahead: evaluateConditionsPerBar (candle-pattern signal)", () => {
  const entryCondition: ConditionNode = {
    kind: "signal",
    signal: { family: "CANDLE_PATTERN", pattern: "HAMMER" },
  };
  const exitCondition: ConditionNode = {
    kind: "signal",
    signal: { family: "CANDLE_PATTERN", pattern: "SHOOTING_STAR" },
  };

  it("candle-pattern-driven signals are unaffected by future bars", () => {
    const full = generateCandles(FULL_LENGTH, 7);
    const truncated = full.slice(0, TRUNCATE_AT);

    const fullResult = evaluateConditionsPerBar(full, entryCondition, exitCondition);
    const truncatedResult = evaluateConditionsPerBar(truncated, entryCondition, exitCondition);

    expect(truncatedResult.entry).toEqual(fullResult.entry.slice(0, TRUNCATE_AT));
    expect(truncatedResult.exit).toEqual(fullResult.exit.slice(0, TRUNCATE_AT));
  });
});

describe("no-look-ahead: computeCandlePatternSeries directly", () => {
  it("every candle pattern's series is stable under truncation", () => {
    const full = generateCandles(FULL_LENGTH, 99);
    const truncated = full.slice(0, TRUNCATE_AT);
    const patterns = [
      "DOJI", "HAMMER", "INVERTED_HAMMER", "SHOOTING_STAR", "HANGING_MAN",
      "MARUBOZU_BULLISH", "MARUBOZU_BEARISH", "BULLISH_ENGULFING", "BEARISH_ENGULFING",
      "BULLISH_HARAMI", "BEARISH_HARAMI", "TWEEZER_TOP", "TWEEZER_BOTTOM",
      "MORNING_STAR", "EVENING_STAR", "THREE_WHITE_SOLDIERS", "THREE_BLACK_CROWS",
      "SPINNING_TOP", "PIERCING_LINE", "DARK_CLOUD_COVER",
    ] as const;

    for (const pattern of patterns) {
      const fullSeries = computeCandlePatternSeries(full, pattern);
      const truncatedSeries = computeCandlePatternSeries(truncated, pattern);
      expect(truncatedSeries, `pattern ${pattern} leaked future information`).toEqual(
        fullSeries.slice(0, TRUNCATE_AT),
      );
    }
  });
});

describe("no-look-ahead: computeChartPatternSeries (swing-point-based patterns)", () => {
  it("every chart pattern's series is stable under truncation — the highest-risk case, since swing detection uses a lookback/lookahead window", () => {
    const full = generateCandles(FULL_LENGTH, 123);
    const truncated = full.slice(0, TRUNCATE_AT);
    const patterns = [
      "HEAD_AND_SHOULDERS", "INVERSE_HEAD_AND_SHOULDERS", "DOUBLE_TOP", "DOUBLE_BOTTOM",
      "TRIPLE_TOP", "TRIPLE_BOTTOM", "ASCENDING_TRIANGLE", "DESCENDING_TRIANGLE",
      "SYMMETRICAL_TRIANGLE", "RISING_WEDGE", "FALLING_WEDGE", "BULL_FLAG", "BEAR_FLAG",
      "PENNANT", "RECTANGLE", "CUP_AND_HANDLE", "ROUNDING_BOTTOM", "ROUNDING_TOP",
    ] as const;

    for (const pattern of patterns) {
      const fullSeries = computeChartPatternSeries(full, pattern);
      const truncatedSeries = computeChartPatternSeries(truncated, pattern);
      expect(truncatedSeries, `pattern ${pattern} leaked future information`).toEqual(
        fullSeries.slice(0, TRUNCATE_AT),
      );
    }
  });
});
