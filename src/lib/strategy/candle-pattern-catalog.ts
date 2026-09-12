import type { CandlePatternKind } from "@/lib/candle-patterns";

export interface CandlePatternDef {
  kind: CandlePatternKind;
  label: string;
  candleCount: 1 | 2 | 3;
}

export const CANDLE_PATTERN_CATALOG: CandlePatternDef[] = [
  { kind: "DOJI", label: "Doji", candleCount: 1 },
  { kind: "HAMMER", label: "Hammer", candleCount: 1 },
  { kind: "INVERTED_HAMMER", label: "Inverted Hammer", candleCount: 1 },
  { kind: "SHOOTING_STAR", label: "Shooting Star", candleCount: 1 },
  { kind: "HANGING_MAN", label: "Hanging Man", candleCount: 1 },
  { kind: "MARUBOZU_BULLISH", label: "Bullish Marubozu", candleCount: 1 },
  { kind: "MARUBOZU_BEARISH", label: "Bearish Marubozu", candleCount: 1 },
  { kind: "BULLISH_ENGULFING", label: "Bullish Engulfing", candleCount: 2 },
  { kind: "BEARISH_ENGULFING", label: "Bearish Engulfing", candleCount: 2 },
  { kind: "BULLISH_HARAMI", label: "Bullish Harami", candleCount: 2 },
  { kind: "BEARISH_HARAMI", label: "Bearish Harami", candleCount: 2 },
  { kind: "TWEEZER_TOP", label: "Tweezer Top", candleCount: 2 },
  { kind: "TWEEZER_BOTTOM", label: "Tweezer Bottom", candleCount: 2 },
  { kind: "MORNING_STAR", label: "Morning Star", candleCount: 3 },
  { kind: "EVENING_STAR", label: "Evening Star", candleCount: 3 },
  { kind: "THREE_WHITE_SOLDIERS", label: "Three White Soldiers", candleCount: 3 },
  { kind: "THREE_BLACK_CROWS", label: "Three Black Crows", candleCount: 3 },
];

export const CANDLE_PATTERN_BY_KIND: Map<CandlePatternKind, CandlePatternDef> = new Map(
  CANDLE_PATTERN_CATALOG.map((d) => [d.kind, d]),
);
