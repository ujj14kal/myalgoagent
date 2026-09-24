"use client";

import Agent2D, { type AgentPose } from "@/components/robot/agent-2d";

/** The agent's face in a round badge — for toasts, chips and the tour. */
export default function AgentAvatar({
  pose = "idle",
  size = 44,
  className = "",
}: {
  pose?: AgentPose;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-[#efe9ff] to-[#dcd2f7] ring-2 ring-brand-gold/60 ${className}`}
      style={{ width: size, height: size }}
    >
      <Agent2D pose={pose} size={size * 1.12} crop="head" trackCursor={false} />
    </span>
  );
}
