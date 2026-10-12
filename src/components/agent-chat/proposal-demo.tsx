"use client";

import { useEffect, useState } from "react";
import { Eye } from "lucide-react";
import CandlestickChart from "@/components/candlestick-chart";
import { proposalDemo } from "@/lib/ai/demo-actions";
import type { AgentProposal } from "@/lib/ai/proposals";
import type { DemoData, DemoLine } from "@/lib/demo/proposal-demo";

/** A line (or two) in its own pane under the chart — an indicator measured on a scale of its own. */
function LowerPane({ lines, candles }: { lines: DemoLine[]; candles: DemoData["candles"] }) {
  const t0 = candles[0]?.time ?? 0;
  const span = (candles.at(-1)?.time ?? 1) - t0 || 1;
  const values = lines.flatMap((l) => l.points.map((p) => p.value));
  if (!values.length) return null;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const w = 600;
  const h = 90;
  const y = (v: number) => 6 + (1 - (v - lo) / (hi - lo || 1)) * (h - 12);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-1 h-24 w-full rounded-lg bg-brand-bg" preserveAspectRatio="none" role="img" aria-label="The indicator's own line">
      {lo < 0 && hi > 0 && <line x1={0} x2={w} y1={y(0)} y2={y(0)} stroke="currentColor" strokeOpacity={0.2} strokeDasharray="3 3" />}
      {lines.map((l) => (
        <polyline key={l.label} fill="none" stroke={l.color} strokeWidth={1.6} strokeDasharray={l.dashed ? "4 3" : undefined} vectorEffect="non-scaling-stroke" points={l.points.map((p) => `${(((p.time - t0) / span) * w).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ")} />
      ))}
    </svg>
  );
}

/** The demo itself: a made-up ₹1,000 stock with the thing marked on it, and what to look at in words. */
export function DemoView({ demo }: { demo: DemoData }) {
  return (
    <>
      <CandlestickChart candles={demo.candles} markers={demo.markers} notes={demo.notes} overlays={demo.overlays.map((l) => ({ label: l.label, color: l.color, dashed: l.dashed, points: l.points }))} height={260} />
      {demo.lower.length > 0 && <LowerPane lines={demo.lower} candles={demo.candles} />}
      <ul className="mt-2.5 space-y-1 px-1 text-xs leading-relaxed text-brand-navy/70">
        {demo.lines.map((l) => (
          <li key={l}>• {l}</li>
        ))}
      </ul>
    </>
  );
}

/** "How it would look": the block, indicator or concept drawn on a made-up ₹1,000 stock, so the user sees it before anything is created. */
export default function ProposalDemo({ proposal }: { proposal: AgentProposal }) {
  const [state, setState] = useState<{ demo: DemoData } | { error: string } | null>(null);
  useEffect(() => {
    let live = true;
    proposalDemo(proposal)
      .then((r) => live && setState(r.ok ? { demo: r.demo } : { error: r.error }))
      .catch(() => live && setState({ error: "Couldn't draw the demo just now. You can still review and create it." }));
    return () => {
      live = false;
    };
    // Redraw only when what is being shown changes, not on every keystroke in the name field.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(proposal.kind === "block" ? proposal.draft.definition : proposal.kind === "indicator" ? proposal.draft.def : proposal.kind === "concept" ? [proposal.draft.definition, proposal.draft.newBlocks] : null)]);

  return (
    <section className="mb-5 overflow-hidden rounded-2xl ring-1 ring-brand-primary/15" aria-label="How it would look">
      <header className="flex items-center justify-between gap-2 bg-brand-primary/[0.06] px-4 py-2.5">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-brand-primary">
          <Eye size={13} /> How it would look
        </p>
        <p className="text-[11px] text-brand-navy/50">Made-up stock · starts at ₹1,000 · not real prices</p>
      </header>
      <div className="bg-white px-3 pb-3 pt-2">
        {state === null ? (
          <div className="flex h-56 items-center justify-center text-xs text-brand-navy/45">
            <span className="mr-2 h-3.5 w-3.5 animate-spin rounded-full border-2 border-brand-primary/30 border-t-brand-primary" /> Drawing the demo…
          </div>
        ) : "error" in state ? (
          <p className="px-1 py-6 text-center text-xs text-brand-navy/55">{state.error}</p>
        ) : (
          <DemoView demo={state.demo} />
        )}
      </div>
    </section>
  );
}
