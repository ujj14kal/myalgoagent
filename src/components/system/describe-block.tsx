"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { useAgentChat } from "@/components/agent-chat/agent-chat-provider";

const IDEAS = [
  "A break of structure to the upside on the 15-minute chart",
  "A fair value gap that price comes back into",
  "Price sweeping the previous day's low and closing back above it",
  "The first 30 minutes after the market opens",
  "Volume at least twice its 20-candle average",
  "Close above the 50 EMA while the 50 EMA is rising",
];

/** Blocks are made by describing them: Mr. Agent writes the rule, you review it and create the block. */
export default function DescribeBlock() {
  const { agentName, openBuild } = useAgentChat();
  const [text, setText] = useState("");
  const ask = (idea: string) => openBuild("block", idea);
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <section className="surface space-y-3 p-5">
        <p className="text-sm font-semibold text-brand-navy">Describe the market component</p>
        <p className="text-xs text-brand-navy/55">
          A block answers one question: <span className="font-semibold text-brand-navy">&ldquo;is this present on this candle?&rdquo;</span> It has no instrument, side, size, stop or target. Say what it is in your own words — {agentName} writes the rule in plain sight for you to review.
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder="e.g. a liquidity sweep: price takes out the previous swing low and closes back above it"
          className="w-full rounded-lg border border-brand-navy/15 px-3 py-2 text-sm outline-none focus:border-brand-primary"
        />
        <button type="button" disabled={!text.trim()} onClick={() => ask(text.trim())} className="inline-flex items-center gap-1.5 rounded-full bg-brand-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
          <Sparkles size={14} /> Ask {agentName} to build it
        </button>
        <div className="flex flex-wrap gap-1.5">
          {IDEAS.map((i) => (
            <button key={i} type="button" onClick={() => ask(i)} className="rounded-full border border-dashed border-brand-navy/20 px-3 py-1 text-xs text-brand-navy/65 hover:border-brand-primary">
              {i}
            </button>
          ))}
        </div>
        <p className="text-xs text-brand-navy/50">Nothing is saved until you press Create block in the review. A saved block can be reused in any concept and added to a strategy&apos;s rules with &ldquo;+ Saved block&rdquo;.</p>
      </section>
    </div>
  );
}
