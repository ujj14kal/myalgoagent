"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Drawing } from "@/lib/chart-drawing-primitive";

type Tool = { kind: Drawing["kind"]; label: string; hint: string; icon: ReactNode };

// The five tools most charting tools reach for first — kept directly in the
// vertical rail. Everything added afterward (Ray, Arrow, Circle, Measure,
// Anchored VWAP, Volume Profile, Long/Short position) lives in the "More"
// flyout instead of stacking onto the rail: with all 13 tools in one flat
// column the rail grew taller than the chart itself and ran below the
// x-axis — a real layout bug a user hit live, not just a style nitpick.
const CORE_TOOLS: Tool[] = [
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
];

const MORE_TOOLS: Tool[] = [
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
  {
    kind: "longPosition",
    label: "Long position",
    hint: "Click entry, then stop, then target",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M2 13h12M4 13V9M8 13V5M12 13V7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M12 2l2.5 2.5M14.5 4.5L12 7M14.5 4.5H10.5" stroke="#00a83e" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    kind: "shortPosition",
    label: "Short position",
    hint: "Click entry, then stop, then target",
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M2 13h12M4 13V9M8 13V5M12 13V7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M12 14l2.5-2.5M14.5 11.5L12 9M14.5 11.5H10.5" stroke="#d60000" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

function ToolButton({
  tool,
  active,
  onClick,
}: {
  tool: Tool;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={tool.hint ? `${tool.label} — ${tool.hint}` : tool.label}
      onClick={onClick}
      className={`flex h-8 w-8 items-center justify-center rounded-md ${
        active ? "bg-brand-primary text-white" : "text-brand-navy/50 hover:bg-brand-bg hover:text-brand-navy"
      }`}
    >
      {tool.icon}
    </button>
  );
}

/** Vertical icon rail beside the chart, matching a TradingView-style layout.
 * Core tools stay in the rail; everything else lives in a "More tools"
 * flyout that opens to the right, so the rail's height never depends on how
 * many drawing tools the app has. */
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
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const activeInMore = MORE_TOOLS.some((t) => t.kind === activeTool);

  useEffect(() => {
    if (!moreOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [moreOpen]);

  function selectTool(kind: Drawing["kind"]) {
    onSelectTool(activeTool === kind ? null : kind);
  }

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
      {CORE_TOOLS.map((t) => (
        <ToolButton key={t.kind} tool={t} active={activeTool === t.kind} onClick={() => selectTool(t.kind)} />
      ))}

      <div ref={moreRef} className="relative">
        <button
          type="button"
          title="More drawing tools"
          onClick={() => setMoreOpen((v) => !v)}
          className={`flex h-8 w-8 items-center justify-center rounded-md ${
            activeInMore || moreOpen ? "bg-brand-primary text-white" : "text-brand-navy/50 hover:bg-brand-bg hover:text-brand-navy"
          }`}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="3.5" cy="8" r="1.4" fill="currentColor" />
            <circle cx="8" cy="8" r="1.4" fill="currentColor" />
            <circle cx="12.5" cy="8" r="1.4" fill="currentColor" />
          </svg>
        </button>
        {moreOpen && (
          <div className="absolute left-full top-0 z-20 ml-1 w-44 rounded-lg border border-black/10 bg-white p-1.5 shadow-lg">
            {MORE_TOOLS.map((t) => (
              <button
                key={t.kind}
                type="button"
                onClick={() => {
                  selectTool(t.kind);
                  setMoreOpen(false);
                }}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-medium ${
                  activeTool === t.kind ? "bg-brand-primary text-white" : "text-brand-navy hover:bg-brand-bg"
                }`}
              >
                <span className={activeTool === t.kind ? "text-white" : "text-brand-navy/60"}>{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>

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
