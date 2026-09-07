"use client";

import type { RobotPose } from "./robot-mascot";

const HEAD = "#ffffff";
const INK = "#471898";
const RING = "#bda360";

function mouthPath(pose: RobotPose) {
  switch (pose) {
    case "sad":
      return <path d="M62 92 Q80 76 98 92" stroke={INK} strokeWidth="6" strokeLinecap="round" fill="none" />;
    case "alert":
      return <ellipse cx="80" cy="84" rx="8" ry="11" fill={INK} />;
    case "talk":
      return <rect x="64" y="79" width="32" height="9" rx="4.5" fill="#466fff" />;
    case "thinking":
      return <path d="M68 84 Q84 88 94 78" stroke={INK} strokeWidth="6" strokeLinecap="round" fill="none" />;
    case "idle":
    case "wave":
    case "point":
      return <path d="M62 80 Q80 96 98 80" stroke={INK} strokeWidth="6" strokeLinecap="round" fill="none" />;
    default:
      // happy is the resting/default expression — always smiling
      return <path d="M62 80 Q80 96 98 80" stroke={INK} strokeWidth="6" strokeLinecap="round" fill="none" />;
  }
}

/** A persistent, WhatsApp-DP-style circular avatar — the icon's face on a
 * fixed violet + gold ring, always blinking. Pose only changes the mouth
 * (and closes the eyes for "sleep"); the container color never changes,
 * so this reads as the one consistent agent identity everywhere it appears. */
export default function RobotAvatar({
  pose = "happy",
  size = 44,
  className = "",
}: {
  pose?: RobotPose;
  size?: number;
  className?: string;
}) {
  const asleep = pose === "sleep";
  const faceSize = size * 0.72;

  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full ${className}`}
      style={{
        width: size,
        height: size,
        background: INK,
        border: `${Math.max(2, size * 0.045)}px solid ${RING}`,
        boxShadow: "0 2px 8px rgba(71,24,152,0.4)",
      }}
    >
      <svg viewBox="0 -10 160 116" width={faceSize} height={faceSize} fill="none" xmlns="http://www.w3.org/2000/svg">
        <line x1="80" y1="6" x2="80" y2="-9" stroke={HEAD} strokeWidth="11" strokeLinecap="round" />
        <rect x="34" y="4" width="92" height="92" rx="24" fill={HEAD} />
        <rect x="20" y="32" width="16" height="34" rx="6" fill={HEAD} />
        <rect x="124" y="32" width="16" height="34" rx="6" fill={HEAD} />
        {asleep ? (
          <>
            <line x1="50" y1="50" x2="66" y2="50" stroke={INK} strokeWidth="6" strokeLinecap="round" />
            <line x1="94" y1="50" x2="110" y2="50" stroke={INK} strokeWidth="6" strokeLinecap="round" />
          </>
        ) : (
          <>
            <circle className="robot-eye" cx="58" cy="50" r="11" fill={INK} />
            <circle className="robot-eye" cx="102" cy="50" r="11" fill={INK} />
          </>
        )}
        <g transform="translate(0,-10)">{mouthPath(pose)}</g>
      </svg>
    </div>
  );
}
