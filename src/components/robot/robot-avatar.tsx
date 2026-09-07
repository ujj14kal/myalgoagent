"use client";

import type { RobotPose } from "./robot-mascot";

const GLOW: Record<RobotPose, string> = {
  idle: "#471898",
  wave: "#471898",
  point: "#471898",
  talk: "#466fff",
  alert: "#d60000",
  sleep: "#9aa5b1",
  happy: "#00a83e",
  sad: "#466fff",
  thinking: "#bda360",
};

const INK = "#471898";

function mouthPath(pose: RobotPose) {
  if (pose === "happy") return <path d="M64 82 Q80 96 96 82" stroke={INK} strokeWidth="5" strokeLinecap="round" fill="none" />;
  if (pose === "sad") return <path d="M64 90 Q80 78 96 90" stroke={INK} strokeWidth="5" strokeLinecap="round" fill="none" />;
  if (pose === "alert") return <ellipse cx="80" cy="85" rx="7" ry="9" fill={INK} />;
  if (pose === "talk") return <rect x="66" y="82" width="28" height="6" rx="3" fill="#466fff" />;
  return null;
}

export default function RobotAvatar({
  pose = "talk",
  size = 44,
  className = "",
}: {
  pose?: RobotPose;
  size?: number;
  className?: string;
}) {
  const glow = GLOW[pose];
  const asleep = pose === "sleep";

  return (
    <div
      className={`shrink-0 rounded-full ${className}`}
      style={{ width: size, height: size, background: glow + "1a" }}
    >
      <svg viewBox="20 0 120 106" width={size} height={size} fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M74 14 L80 2 L86 14Z" fill="#ffffff" />
        <rect x="20" y="14" width="120" height="92" rx="26" fill="#ffffff" />
        <rect x="6" y="42" width="16" height="34" rx="6" fill="#ffffff" />
        <rect x="138" y="42" width="16" height="34" rx="6" fill="#ffffff" />
        {asleep ? (
          <>
            <line x1="50" y1="60" x2="66" y2="60" stroke={INK} strokeWidth="5" strokeLinecap="round" />
            <line x1="94" y1="60" x2="110" y2="60" stroke={INK} strokeWidth="5" strokeLinecap="round" />
          </>
        ) : (
          <>
            <circle cx="58" cy="60" r="10" fill={INK} />
            <circle cx="102" cy="60" r="10" fill={INK} />
          </>
        )}
        {mouthPath(pose)}
      </svg>
    </div>
  );
}
