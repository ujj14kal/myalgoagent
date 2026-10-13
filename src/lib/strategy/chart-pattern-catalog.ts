import type { ChartPatternKind } from "@/lib/chart-patterns";

export interface ChartPatternDef {
  kind: ChartPatternKind;
  label: string;
}

export const CHART_PATTERN_CATALOG: ChartPatternDef[] = [
  { kind: "HEAD_AND_SHOULDERS", label: "Head & Shoulders" },
  { kind: "INVERSE_HEAD_AND_SHOULDERS", label: "Inverse Head & Shoulders" },
  { kind: "DOUBLE_TOP", label: "Double Top" },
  { kind: "DOUBLE_BOTTOM", label: "Double Bottom" },
  { kind: "TRIPLE_TOP", label: "Triple Top" },
  { kind: "TRIPLE_BOTTOM", label: "Triple Bottom" },
  { kind: "ASCENDING_TRIANGLE", label: "Ascending Triangle" },
  { kind: "DESCENDING_TRIANGLE", label: "Descending Triangle" },
  { kind: "SYMMETRICAL_TRIANGLE", label: "Symmetrical Triangle" },
  { kind: "RISING_WEDGE", label: "Rising Wedge" },
  { kind: "FALLING_WEDGE", label: "Falling Wedge" },
  { kind: "BULL_FLAG", label: "Bull Flag" },
  { kind: "BEAR_FLAG", label: "Bear Flag" },
  { kind: "PENNANT", label: "Pennant" },
  { kind: "RECTANGLE", label: "Rectangle (Channel)" },
  { kind: "CUP_AND_HANDLE", label: "Cup and Handle" },
  { kind: "ROUNDING_BOTTOM", label: "Rounding Bottom" },
  { kind: "ROUNDING_TOP", label: "Rounding Top" },
  { kind: "BULLISH_GARTLEY", label: "Bullish Gartley (harmonic)" },
  { kind: "BEARISH_GARTLEY", label: "Bearish Gartley (harmonic)" },
  { kind: "BULLISH_BAT", label: "Bullish Bat (harmonic)" },
  { kind: "BEARISH_BAT", label: "Bearish Bat (harmonic)" },
  { kind: "BULLISH_BUTTERFLY", label: "Bullish Butterfly (harmonic)" },
  { kind: "BEARISH_BUTTERFLY", label: "Bearish Butterfly (harmonic)" },
  { kind: "BULLISH_CRAB", label: "Bullish Crab (harmonic)" },
  { kind: "BEARISH_CRAB", label: "Bearish Crab (harmonic)" },
];

export const CHART_PATTERN_BY_KIND: Map<ChartPatternKind, ChartPatternDef> = new Map(
  CHART_PATTERN_CATALOG.map((d) => [d.kind, d]),
);
