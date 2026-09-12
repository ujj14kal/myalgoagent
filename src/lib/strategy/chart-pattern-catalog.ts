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
];

export const CHART_PATTERN_BY_KIND: Map<ChartPatternKind, ChartPatternDef> = new Map(
  CHART_PATTERN_CATALOG.map((d) => [d.kind, d]),
);
