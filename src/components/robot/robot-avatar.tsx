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
  switch (pose) {
    case "happy":
      return <path d="M62 80 Q80 98 98 80" stroke={INK} strokeWidth="6" strokeLinecap="round" fill="none" />;
    case "sad":
      return <path d="M62 92 Q80 76 98 92" stroke={INK} strokeWidth="6" strokeLinecap="round" fill="none" />;
    case "alert":
      return <ellipse cx="80" cy="84" rx="8" ry="11" fill={INK} />;
    case "talk":
      return <rect x="64" y="79" width="32" height="9" rx="4.5" fill="#466fff" />;
    case "thinking":
      // offset, slightly puckered — reads as "considering something"
      return <path d="M68 84 Q84 88 94 78" stroke={INK} strokeWidth="6" strokeLinecap="round" fill="none" />;
    default:
      // idle / wave / point / sleep-adjacent neutral: a plain closed-lip line
      return <rect x="64" y="82" width="32" height="7" rx="3.5" fill={INK} opacity="0.55" />;
  }
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
      style={{
        width: size,
        height: size,
        background: glow + "26",
        border: `2px solid ${glow}`,
        boxShadow: `0 2px 6px ${glow}40`,
      }}
    >
      <svg viewBox="20 0 120 106" width={size} height={size} fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M74 14 L80 2 L86 14Z" fill="#ffffff" />
        <rect x="20" y="14" width="120" height="92" rx="26" fill="#ffffff" />
        <rect x="6" y="42" width="16" height="34" rx="6" fill="#ffffff" />
        <rect x="138" y="42" width="16" height="34" rx="6" fill="#ffffff" />
        {asleep ? (
          <>
            <line x1="50" y1="60" x2="66" y2="60" stroke={INK} strokeWidth="6" strokeLinecap="round" />
            <line x1="94" y1="60" x2="110" y2="60" stroke={INK} strokeWidth="6" strokeLinecap="round" />
          </>
        ) : (
          <>
            <circle cx="58" cy="60" r="11" fill={INK} />
            <circle cx="102" cy="60" r="11" fill={INK} />
          </>
        )}
        {mouthPath(pose)}
      </svg>
    </div>
  );
}
