"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { useAgentChat } from "@/components/agent-chat/agent-chat-provider";

const IDEAS = [
  "How far price is from its 50-day average, measured in ATRs — buy when it is stretched below, exit when it comes back",
  "Today's volume compared with the last 20 days — enter on a volume surge above a rising 20-day average",
  "Where the close sits in the last 20 days' high–low range, 0 to 100 — buy near the low end, exit near the high end",
  "A flag that's 1 when the 20 EMA is above the 50 EMA and price is above VWAP — buy when it turns on",
];

/** Say what you want in plain words; the agent writes the indicator and a strategy that uses it, and opens it for you to preview. */
export default function DescribeIndicator() {
  const { agentName, openChat } = useAgentChat();
  const [text, setText] = useState("");
  const ask = (idea: string) => openChat(`Make me a custom indicator and a strategy that uses it: ${idea}`);
  return (
    <div className="space-y-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="e.g. how strong the trend is — price above its 50-day average by how many ATRs — and buy when it is strong"
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
      <p className="text-xs text-brand-navy/50">
        {agentName} turns your words into a formula you can read and a strategy that uses it. Press Preview to open that exact strategy in the builder — chart preview, replay animation and every option — or Review to create it. Nothing is saved until you confirm.
      </p>
    </div>
  );
}
