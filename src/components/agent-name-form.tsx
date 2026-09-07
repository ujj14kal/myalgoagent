"use client";

import { useState } from "react";
import { setAgentNameAction } from "@/lib/agent-actions";
import { DEFAULT_AGENT_NAME } from "@/lib/agent-constants";
import RobotAvatar from "@/components/robot/robot-avatar";
import ReplayTourButton from "@/components/tutorial/replay-tour-button";

export default function AgentNameForm({ initialName }: { initialName: string }) {
  const [name, setName] = useState(initialName);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setSubmitting(true);
    const result = await setAgentNameAction(name);
    setSubmitting(false);
    setMessage(result.ok ? { type: "ok", text: "Saved." } : { type: "error", text: result.error });
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-start gap-4">
      <RobotAvatar pose={submitting ? "thinking" : message?.type === "ok" ? "happy" : "idle"} size={48} />
      <div className="flex-1 space-y-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={DEFAULT_AGENT_NAME}
          maxLength={24}
          className="w-full rounded-lg border border-brand-navy/15 px-3 py-2 text-sm outline-none focus:border-brand-primary"
        />
        {message && (
          <p className={`text-sm ${message.type === "ok" ? "text-brand-buy" : "text-brand-sell"}`}>{message.text}</p>
        )}
        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-full bg-brand-primary px-5 py-2 text-sm font-semibold text-white hover:bg-brand-primary-light disabled:opacity-50"
          >
            {submitting ? "Saving…" : "Save name"}
          </button>
          <span className="inline-flex items-center gap-1.5 text-sm text-brand-navy/60">
            <ReplayTourButton />
            Replay the tour
          </span>
        </div>
      </div>
    </form>
  );
}
