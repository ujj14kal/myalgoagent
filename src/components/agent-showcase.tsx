"use client";

import { useEffect, useState } from "react";
import Agent2D, { type AgentPose } from "@/components/robot/agent-2d";

const JOBS: { pose: AgentPose; label: string; when: string }[] = [
  { pose: "analyzing", label: "Watching", when: "Tracks your live paper sessions and portfolio." },
  { pose: "working", label: "Building", when: "Keeps your strategies saved, drafts included." },
  { pose: "thinking", label: "Inspecting", when: "Runs backtests and session syncs." },
  { pose: "guarding", label: "Guarding", when: "Enforces your risk limits on the server." },
  { pose: "alert", label: "Warning", when: "Tells you the moment a limit or the kill switch trips." },
  { pose: "happy", label: "Reporting", when: "Lets you know when an order fills." },
];

/** The agent at full size, cycling through the jobs it actually does. */
export default function AgentShowcase({ agentName }: { agentName: string }) {
  const [i, setI] = useState(0);
  const [auto, setAuto] = useState(true);
  useEffect(() => {
    if (!auto) return;
    const id = setInterval(() => setI((n) => (n + 1) % JOBS.length), 3200);
    return () => clearInterval(id);
  }, [auto]);
  const job = JOBS[i];
  return (
    <section className="surface overflow-hidden">
      <div className="app-sidebar-bg flex justify-center px-6 pb-2 pt-6">
        <Agent2D pose={job.pose} size={170} />
      </div>
      <div className="p-5 text-center">
        <p className="text-base font-bold text-brand-navy">{agentName}</p>
        <p className="mt-0.5 text-sm text-brand-navy/60">
          <span className="font-semibold text-brand-primary">{job.label}</span> — {job.when}
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-1.5">
          {JOBS.map((j, n) => (
            <button
              key={j.pose}
              type="button"
              onClick={() => {
                setAuto(false);
                setI(n);
              }}
              aria-pressed={n === i}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                n === i ? "bg-brand-primary text-white" : "bg-brand-navy/[0.05] text-brand-navy/60 hover:text-brand-primary"
              }`}
            >
              {j.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
