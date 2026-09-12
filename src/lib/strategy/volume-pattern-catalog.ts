import type { VolumePatternKind } from "@/lib/volume-patterns";

export interface VolumePatternDef {
  kind: VolumePatternKind;
  label: string;
}

export const VOLUME_PATTERN_CATALOG: VolumePatternDef[] = [
  { kind: "VOLUME_SPIKE", label: "Volume Spike (2x average)" },
  { kind: "VOLUME_DRY_UP", label: "Volume Dry-Up (0.5x average)" },
  { kind: "BULLISH_VOLUME_BREAKOUT", label: "Bullish Volume Breakout" },
  { kind: "BEARISH_VOLUME_BREAKDOWN", label: "Bearish Volume Breakdown" },
];

export const VOLUME_PATTERN_BY_KIND: Map<VolumePatternKind, VolumePatternDef> = new Map(
  VOLUME_PATTERN_CATALOG.map((d) => [d.kind, d]),
);
