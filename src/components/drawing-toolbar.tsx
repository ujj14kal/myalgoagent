"use client";

import type { ReactNode } from "react";
import type { Drawing } from "@/lib/chart-drawing-primitive";

const TOOLS: { kind: Drawing["kind"]; label: string; hint: string; icon: ReactNode }[] = [
  {
    kind: "trendline",
    label: "Trend line",
    hint: "Click two points",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M2 13 L14 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="2" cy="13" r="1.6" fill="currentColor" />
        <circle cx="14" cy="3" r="1.6" fill="currentColor" />
      </svg>
    ),
  },
  {
    kind: "horizontal",
    label: "Horizontal line",
    hint: "Click once",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M2 8 H14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="2.5 2" />
      </svg>
    ),
  },
  {
    kind: "rectangle",
    label: "Rectangle",
    hint: "Click two corners",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="2.5" y="4" width="11" height="8" rx="1" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    ),
  },
  {
    kind: "fibonacci",
    label: "Fibonacci",
    hint: "Click two points",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M2 3 H14 M2 6.5 H14 M2 10 H14 M2 13 H14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    kind: "text",
    label: "Text",
    hint: "Click to place",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M3 3h10M8 3v10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    kind: "ray",
    label: "Ray",
    hint: "Click two points",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M2 13 L9 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M9 6 L15 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="1.5 1.5" />
        <circle cx="2" cy="13" r="1.6" fill="currentColor" />
      </svg>
    ),
  },
  {
    kind: "arrow",
    label: "Arrow",
    hint: "Click two points",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M2 13 L13 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M13 3 L8 4 M13 3 L12 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    kind: "circle",
    label: "Circle",
    hint: "Click two corners",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <ellipse cx="8" cy="8" rx="5.5" ry="4" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    ),
  },
  {
    kind: "measure",
    label: "Measure",
    hint: "Click two points — shows price/% delta",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="2.5" y="4" width="11" height="8" rx="1" strokeDasharray="2 1.5" stroke="currentColor" strokeWidth="1.4" />
        <path d="M5 8h6" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    ),
  },
  {
    kind: "anchoredVwap",
    label: "Anchored VWAP",
    hint: "Click a bar to anchor",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M2 12 Q5 4 8 9 T14 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="2" cy="12" r="1.6" fill="currentColor" />
      </svg>
    ),
  },
  {
    kind: "volumeProfile",
    label: "Fixed range volume profile",
    hint: "Click a start and end bar",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="2" y="3" width="6" height="2" fill="currentColor" />
        <rect x="2" y="6.5" width="10" height="2" fill="currentColor" />
        <rect x="2" y="10" width="4" height="2" fill="currentColor" />
      </svg>
    ),
  },
];

/** Vertical icon rail beside the chart, matching a TradingView-style layout. */
export default function DrawingToolbar({
  activeTool,
  onSelectTool,
  drawingsCount,
  onClear,
  magnetEnabled,
  onToggleMagnet,
}: {
  activeTool: Drawing["kind"] | null;
  onSelectTool: (tool: Drawing["kind"] | null) => void;
  drawingsCount: number;
  onClear: () => void;
  magnetEnabled: boolean;
  onToggleMagnet: () => void;
}) {
  return (
    <div className="flex w-10 shrink-0 flex-col items-center gap-1 border-r border-black/5 py-2">
      <button
        type="button"
        title={magnetEnabled ? "Magnet snap: on — points snap to nearest OHLC" : "Magnet snap: off"}
        onClick={onToggleMagnet}
        className={`flex h-8 w-8 items-center justify-center rounded-md ${
          magnetEnabled ? "bg-brand-gold text-white" : "text-brand-navy/50 hover:bg-brand-bg hover:text-brand-navy"
        }`}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M4 2v5a4 4 0 0 0 8 0V2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M4 2H2v5a6 6 0 0 0 12 0V2h-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
      <span className="my-0.5 h-px w-6 bg-black/5" />
      {TOOLS.map((t) => (
        <button
          key={t.kind}
          type="button"
          title={t.hint ? `${t.label} — ${t.hint}` : t.label}
          onClick={() => onSelectTool(activeTool === t.kind ? null : t.kind)}
          className={`flex h-8 w-8 items-center justify-center rounded-md ${
            activeTool === t.kind ? "bg-brand-primary text-white" : "text-brand-navy/50 hover:bg-brand-bg hover:text-brand-navy"
          }`}
        >
          {t.icon}
        </button>
      ))}
      {drawingsCount > 0 && (
        <button
          type="button"
          title={`Clear ${drawingsCount} drawing${drawingsCount === 1 ? "" : "s"}`}
          onClick={onClear}
          className="mt-1 flex h-8 w-8 items-center justify-center rounded-md text-brand-navy/40 hover:bg-brand-sell/10 hover:text-brand-sell"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 4.5H13M6 4.5V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5M4.5 4.5V13a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1V4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
    </div>
  );
}
