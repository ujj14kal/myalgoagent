"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { useAgentChat } from "@/components/agent-chat/agent-chat-provider";
import { DESCRIBE_PREFIX } from "@/lib/ai/describe-indicator";

const IDEAS = [
  "How far price is from its 50-day average, measured in ATRs",
  "Today's volume compared with its 20-day average",
  "Where the close sits in the last 20 days' high–low range, 0 to 100",
  "A flag that's 1 when the 20 EMA is above the 50 EMA and price is above VWAP",
  "A channel from the highest high to the lowest low of the last 20 days",
  "Bollinger-style band: 20-day average plus and minus 2 standard deviations",
];

/** Say what you want in plain words; the agent writes the indicator and shows you its formula to review and save. */
export default function DescribeIndicator() {
  const { agentName, openChat } = useAgentChat();
  const [text, setText] = useState("");
  const ask = (idea: string) => openChat(`${DESCRIBE_PREFIX}${idea}`);
  return (
    <div className="space-y-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="e.g. how strong the trend is — how many ATRs price sits above its 50-day average"
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
        {agentName} turns your words into an indicator with a formula you can read. Review it, change the name if you like, and press Save indicator. Nothing is saved until you confirm. To trade it, use it by name in any strategy rule.
      </p>
    </div>
  );
}
