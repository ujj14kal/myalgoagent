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
];

/** Vertical icon rail beside the chart, matching a TradingView-style layout. */
export default function DrawingToolbar({
  activeTool,
  onSelectTool,
  drawingsCount,
  onClear,
}: {
  activeTool: Drawing["kind"] | null;
  onSelectTool: (tool: Drawing["kind"] | null) => void;
  drawingsCount: number;
  onClear: () => void;
}) {
  return (
    <div className="flex w-10 shrink-0 flex-col items-center gap-1 border-r border-black/5 py-2">
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
