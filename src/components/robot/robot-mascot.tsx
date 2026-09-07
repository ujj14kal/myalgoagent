"use client";

import { motion } from "motion/react";

export type RobotPose =
  | "idle"
  | "wave"
  | "point"
  | "talk"
  | "alert"
  | "sleep"
  | "happy"
  | "sad"
  | "thinking";

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
const BODY = "#471898";
const BODY_DARK = "#3a1279";
// A pure-white head disappears against the white cards this mascot sits
// on almost everywhere — an off-white keeps the icon's look while staying
// visible on any light background.
const HEAD = "#f4f2fb";
const HEAD_STROKE = "rgba(71,24,152,0.14)";

// The icon mark has no mouth at all — only add one for poses where it's
// functionally needed to read the expression. Happy is the resting/default
// expression, so idle also smiles.
function Mouth({ pose }: { pose: RobotPose }) {
  switch (pose) {
    case "happy":
    case "idle":
    case "wave":
    case "point":
      return <path d="M64 82 Q80 96 96 82" stroke={INK} strokeWidth="5" strokeLinecap="round" fill="none" />;
    case "sad":
      return <path d="M64 90 Q80 78 96 90" stroke={INK} strokeWidth="5" strokeLinecap="round" fill="none" />;
    case "alert":
      return <ellipse cx="80" cy="85" rx="7" ry="9" fill={INK} />;
    case "talk":
      return (
        <motion.rect
          x="66"
          y="80"
          width="28"
          height="8"
          rx="4"
          fill="#466fff"
          animate={{ scaleY: [1, 0.4, 1] }}
          transition={{ duration: 0.6, repeat: Infinity }}
          style={{ transformOrigin: "80px 84px" }}
        />
      );
    default:
      return null;
  }
}

export default function RobotMascot({
  pose = "happy",
  size = 120,
  className = "",
}: {
  pose?: RobotPose;
  size?: number;
  className?: string;
}) {
  const glow = GLOW[pose];
  const armUp = pose === "wave" || pose === "point";
  const asleep = pose === "sleep";

  return (
    <motion.div
      className={className}
      style={{ width: size, height: size * 1.35, position: "relative" }}
      animate={
        asleep
          ? { y: 0 }
          : pose === "thinking"
          ? { y: [0, -6, 0], rotate: [-3, 3, -3] }
          : { y: [0, -6, 0] }
      }
      transition={asleep ? undefined : { duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
    >
      <svg viewBox="0 0 160 216" width="100%" height="100%" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* floor shadow */}
        <ellipse cx="80" cy="204" rx="34" ry="7" fill="#0e1b2d" opacity="0.12" />

        {/* celebratory sparkles */}
        {pose === "happy" && (
          <>
            <path d="M18 30 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3Z" fill="#bda360" />
            <path d="M142 20 l2 6 6 2 -6 2 -2 6 -2 -6 -6 -2 6 -2Z" fill="#466fff" />
          </>
        )}
        {pose === "thinking" && (
          <>
            <circle cx="130" cy="16" r="3" fill={INK} opacity="0.5" />
            <circle cx="140" cy="8" r="4" fill={INK} opacity="0.35" />
            <circle cx="152" cy="0" r="5" fill={INK} opacity="0.2" />
          </>
        )}

        {/* body */}
        <rect x="46" y="118" width="68" height="70" rx="30" fill={BODY} />
        <rect x="46" y="118" width="68" height="70" rx="30" fill="url(#robot-body-shine)" />
        {/* chest light — the pose/emotion indicator, since the face itself stays icon-accurate */}
        <circle cx="80" cy="150" r="9" fill={glow} className={pose === "alert" ? "robot-eye" : undefined} />

        {/* gesture paddle (wave / point) */}
        <motion.g
          animate={
            pose === "wave"
              ? { rotate: [0, 22, -6, 22, 0] }
              : pose === "point"
              ? { rotate: -32 }
              : { rotate: 0 }
          }
          transition={pose === "wave" ? { duration: 1.4, repeat: Infinity, repeatDelay: 0.6 } : { duration: 0.3 }}
          style={{ transformOrigin: "112px 128px" }}
        >
          <rect x="106" y="118" width="16" height="34" rx="8" fill={BODY_DARK} opacity={armUp ? 1 : 0} />
        </motion.g>

        {/* neck */}
        <rect x="70" y="100" width="20" height="20" fill={HEAD} />

        {/* head — matches the icon mark: off-white rounded square,
            top/bottom antenna nubs, solid violet eyes, ear-tab bars, no
            mouth or eyebrows by default. A hairline stroke keeps the head
            readable even on a near-white card. */}
        <line x1="80" y1="16" x2="80" y2="1" stroke={HEAD} strokeWidth="11" strokeLinecap="round" />
        <rect x="34" y="14" width="92" height="92" rx="24" fill={HEAD} stroke={HEAD_STROKE} strokeWidth="1.5" />
        <line x1="80" y1="104" x2="80" y2="119" stroke={HEAD} strokeWidth="11" strokeLinecap="round" />

        <rect x="20" y="42" width="16" height="34" rx="6" fill={HEAD} stroke={HEAD_STROKE} strokeWidth="1.5" />
        <rect x="124" y="42" width="16" height="34" rx="6" fill={HEAD} stroke={HEAD_STROKE} strokeWidth="1.5" />

        {/* eyes */}
        {asleep ? (
          <>
            <line x1="50" y1="60" x2="66" y2="60" stroke={INK} strokeWidth="5" strokeLinecap="round" />
            <line x1="94" y1="60" x2="110" y2="60" stroke={INK} strokeWidth="5" strokeLinecap="round" />
          </>
        ) : (
          <>
            <circle className="robot-eye" cx="58" cy="60" r="10" fill={INK} />
            <circle className="robot-eye" cx="102" cy="60" r="10" fill={INK} />
          </>
        )}

        <Mouth pose={pose} />

        <defs>
          <linearGradient id="robot-body-shine" x1="46" y1="118" x2="114" y2="188" gradientUnits="userSpaceOnUse">
            <stop stopColor="#ffffff" stopOpacity="0.14" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>
    </motion.div>
  );
}
