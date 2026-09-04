"use client";

import type { Drawing } from "@/lib/chart-drawing-primitive";

const TOOLS: { kind: Drawing["kind"]; label: string; hint: string }[] = [
  { kind: "trendline", label: "Trend line", hint: "Click two points" },
  { kind: "horizontal", label: "Horizontal line", hint: "Click once" },
  { kind: "rectangle", label: "Rectangle", hint: "Click two corners" },
  { kind: "fibonacci", label: "Fibonacci", hint: "Click two points" },
];

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
    <div className="flex flex-wrap items-center gap-2">
      {TOOLS.map((t) => (
        <button
          key={t.kind}
          type="button"
          title={t.hint}
          onClick={() => onSelectTool(activeTool === t.kind ? null : t.kind)}
          className={`rounded-full border px-3 py-1 text-xs font-medium ${
            activeTool === t.kind
              ? "border-transparent bg-brand-primary text-white"
              : "border-brand-navy/15 text-brand-navy/60 hover:border-brand-primary"
          }`}
        >
          {t.label}
        </button>
      ))}
      {drawingsCount > 0 && (
        <button
          type="button"
          onClick={onClear}
          className="rounded-full border border-brand-navy/15 px-3 py-1 text-xs font-medium text-brand-navy/60 hover:border-brand-sell hover:text-brand-sell"
        >
          Clear ({drawingsCount})
        </button>
      )}
      {activeTool && <span className="text-xs text-brand-navy/40">{TOOLS.find((t) => t.kind === activeTool)?.hint}</span>}
    </div>
  );
}
