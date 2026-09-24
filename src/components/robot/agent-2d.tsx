"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion, useSpring } from "motion/react";
/** Moods, plus task poses that show the agent doing the platform's work. */
export type AgentPose =
  | "idle"
  | "wave"
  | "point"
  | "talk"
  | "alert"
  | "sleep"
  | "happy"
  | "sad"
  | "thinking"
  | "working"
  | "analyzing"
  | "guarding";

type Pt = [number, number];

// Brand
const VIOLET = "#471898";
const VIOLET_LIGHT = "#6a35c2";
const VIOLET_DARK = "#33106f";
const HEAD = "#ffffff";
const HEAD_SHADE = "#ece6fb";

// The antenna bulb and chest screen are the agent's status lights.
const LIGHT: Record<AgentPose, string> = {
  idle: "#466fff",
  wave: "#466fff",
  point: "#466fff",
  talk: "#466fff",
  happy: "#00a83e",
  thinking: "#bda360",
  alert: "#d60000",
  sad: "#466fff",
  sleep: "#4a5a6e",
  working: "#466fff",
  analyzing: "#bda360",
  guarding: "#00a83e",
};

const LABEL: Record<AgentPose, string> = {
  idle: "ready",
  wave: "waving hello",
  point: "pointing",
  talk: "talking",
  happy: "celebrating",
  thinking: "inspecting",
  alert: "raising a warning",
  sad: "disappointed",
  sleep: "asleep",
  working: "building on a laptop",
  analyzing: "analyzing a chart",
  guarding: "guarding your risk limits",
};

const SHOULDER_L: Pt = [80, 172];
const SHOULDER_R: Pt = [160, 172];
const REST_L: Pt = [58, 218];
const REST_R: Pt = [182, 218];

// Hand positions per pose. An array is a looping keyframe path. Arms are
// drawn in front of the head and body, so a raised hand is never hidden.
const HANDS: Record<AgentPose, { l: Pt[]; r: Pt[]; dur?: number }> = {
  idle: { l: [REST_L, [60, 214], REST_L], r: [REST_R, [180, 214], REST_R], dur: 3 },
  wave: { l: [REST_L], r: [[206, 118], [218, 142], [206, 118]], dur: 0.7 },
  point: { l: [REST_L], r: [[222, 164]] },
  talk: { l: [REST_L], r: [[196, 180], [204, 160], [196, 180]], dur: 1.1 },
  happy: { l: [[38, 118], [30, 108], [38, 118]], r: [[202, 118], [210, 108], [202, 118]], dur: 0.7 },
  thinking: { l: [REST_L], r: [[160, 124]] },
  alert: { l: [[40, 176], [36, 170], [40, 176]], r: [[206, 116]], dur: 0.5 },
  sad: { l: [[66, 226]], r: [[174, 226]] },
  sleep: { l: [[64, 222]], r: [[176, 222]] },
  working: { l: [[104, 216], [104, 211], [104, 216]], r: [[136, 214], [136, 210], [136, 214]], dur: 0.32 },
  analyzing: { l: [[88, 206]], r: [[152, 206]] },
  guarding: { l: [REST_L], r: [[178, 206]] },
};

const PROPS_OVER_ARMS = new Set<AgentPose>(["working", "guarding"]);

function armPath(s: Pt, h: Pt) {
  // A slight outward elbow so arms read as limbs, not sticks.
  const cx = (s[0] + h[0]) / 2 + (h[0] >= s[0] ? 6 : -6);
  const cy = (s[1] + h[1]) / 2;
  return `M ${s[0]} ${s[1]} Q ${cx} ${cy} ${h[0]} ${h[1]}`;
}

function Arm({ shoulder, pts, dur, reduce, uid }: { shoulder: Pt; pts: Pt[]; dur?: number; reduce: boolean; uid: string }) {
  const loops = pts.length > 1 && !reduce;
  const frames = reduce ? [pts[0]] : pts;
  const transition = loops
    ? { duration: dur ?? 1, repeat: Infinity, ease: "easeInOut" as const }
    : { type: "spring" as const, stiffness: 170, damping: 16 };
  return (
    <g>
      <motion.path
        initial={false}
        animate={{ d: frames.length > 1 ? frames.map((p) => armPath(shoulder, p)) : armPath(shoulder, frames[0]) }}
        transition={transition}
        stroke={`url(#${uid}-arm)`}
        strokeWidth="17"
        strokeLinecap="round"
        fill="none"
      />
      <motion.circle
        initial={false}
        r="12.5"
        fill={`url(#${uid}-hand)`}
        animate={frames.length > 1 ? { cx: frames.map((p) => p[0]), cy: frames.map((p) => p[1]) } : { cx: frames[0][0], cy: frames[0][1] }}
        transition={transition}
      />
    </g>
  );
}

function Eyes({ pose, blink }: { pose: AgentPose; blink: boolean }) {
  const eyes: Pt[] = [
    [98, 92],
    [142, 92],
  ];
  if (pose === "happy") {
    return (
      <>
        {eyes.map(([x, y]) => (
          <path key={x} d={`M${x - 11} ${y + 4} Q${x} ${y - 11} ${x + 11} ${y + 4}`} stroke={VIOLET} strokeWidth="7" strokeLinecap="round" fill="none" />
        ))}
      </>
    );
  }
  if (pose === "sleep") {
    return (
      <>
        {eyes.map(([x, y]) => (
          <path key={x} d={`M${x - 11} ${y} Q${x} ${y + 8} ${x + 11} ${y}`} stroke={VIOLET} strokeWidth="6" strokeLinecap="round" fill="none" />
        ))}
      </>
    );
  }
  const r = pose === "alert" ? 15 : 13;
  return (
    <>
      {eyes.map(([x, y], i) => {
        // Inspecting: the eye behind the magnifier lens reads bigger.
        const scale = pose === "thinking" && i === 1 ? 1.45 : 1;
        return (
          <g key={x}>
            <motion.g
              animate={{ scaleY: blink ? 0.1 : 1, scale }}
              transition={{ duration: blink ? 0.08 : 0.25 }}
              style={{ transformBox: "fill-box", transformOrigin: "center" }}
            >
              <circle cx={x} cy={y} r={r} fill={VIOLET} />
              <circle cx={x - 4.5} cy={y - 5} r={4.2} fill="#ffffff" />
              <circle cx={x + 4} cy={y + 4} r={1.8} fill="#ffffff" opacity="0.7" />
            </motion.g>
            {pose === "sad" && (
              // droopy lid in the head's own color
              <path
                // outer corner low, inner corner high reads as sad (the reverse reads as angry)
                d={i === 0 ? `M${x - 17} ${y - 8} L${x + 17} ${y - 16} L${x + 17} ${y - 9} L${x - 17} ${y - 3} Z` : `M${x - 17} ${y - 16} L${x + 17} ${y - 8} L${x + 17} ${y - 3} L${x - 17} ${y - 9} Z`}
                fill={HEAD}
              />
            )}
          </g>
        );
      })}
    </>
  );
}

function ChestScreen({ pose, color, reduce }: { pose: AgentPose; color: string; reduce: boolean }) {
  const loop = (d: number, delay = 0) => (reduce ? { duration: 0 } : { duration: d, repeat: Infinity, ease: "easeInOut" as const, delay });
  switch (pose) {
    case "alert":
      return (
        <motion.g animate={reduce ? { opacity: 1 } : { opacity: [1, 0.25, 1] }} transition={loop(0.6)}>
          <rect x="117" y="182" width="6" height="13" rx="3" fill={color} />
          <circle cx="120" cy="200" r="3.2" fill={color} />
        </motion.g>
      );
    case "happy":
    case "guarding":
      return <path d="M108 193 L116 201 L133 184" stroke={color} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" />;
    case "thinking":
    case "analyzing":
      return (
        <>
          {[110, 120, 130].map((x, i) => (
            <motion.circle key={x} cx={x} cy={192} r="3.6" fill={color} animate={reduce ? { opacity: 1 } : { opacity: [0.25, 1, 0.25] }} transition={loop(1.1, i * 0.18)} />
          ))}
        </>
      );
    case "sad":
      return <path d="M104 184 L113 191 L121 188 L136 201" stroke={color} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />;
    case "sleep":
      return <text x="114" y="198" fontSize="13" fontWeight="700" fill={color} opacity="0.6">z</text>;
    case "talk":
    case "working":
      return (
        <>
          {[106, 113, 120, 127, 134].map((x, i) => (
            <motion.rect
              key={x}
              x={x - 2}
              y="184"
              width="4"
              height="16"
              rx="2"
              fill={color}
              animate={reduce ? { scaleY: 0.6 } : { scaleY: [0.3, 1, 0.45, 0.85, 0.3] }}
              transition={reduce ? { duration: 0 } : { duration: 0.8, repeat: Infinity, delay: i * 0.1 }}
              style={{ transformBox: "fill-box", transformOrigin: "center" }}
            />
          ))}
        </>
      );
    default:
      // heartbeat — the agent is on duty
      return (
        <motion.path
          d="M100 193 L110 193 L114 184 L120 202 L125 189 L129 193 L140 193"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          initial={false}
          animate={reduce ? { pathLength: 1 } : { pathLength: [0, 1, 1], opacity: [1, 1, 0] }}
          transition={reduce ? { duration: 0 } : { duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        />
      );
  }
}

/** Held props, drawn between the arms and the hands so fingers wrap them. */
function Props({ pose, color, reduce, uid }: { pose: AgentPose; color: string; reduce: boolean; uid: string }) {
  const pop = {
    initial: { opacity: 0, scale: 0.6 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.6, transition: { duration: 0.15 } },
    transition: { type: "spring" as const, stiffness: 260, damping: 18 },
    style: { transformBox: "fill-box" as const, transformOrigin: "center" },
  };
  return (
    <AnimatePresence>
      {pose === "thinking" && (
        <motion.g key="magnifier" {...pop}>
          <line x1="160" y1="124" x2="150" y2="108" stroke={VIOLET_DARK} strokeWidth="7" strokeLinecap="round" />
          <circle cx="142" cy="92" r="21" fill="#dfe8ff" fillOpacity="0.28" stroke="#bda360" strokeWidth="5" />
          <path d="M130 84 Q134 76 142 75" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.9" />
        </motion.g>
      )}
      {pose === "alert" && (
        <motion.g key="sign" {...pop}>
          <line x1="206" y1="116" x2="206" y2="84" stroke={VIOLET_DARK} strokeWidth="5" strokeLinecap="round" />
          <motion.g
            animate={reduce ? { rotate: 0 } : { rotate: [-6, 6, -6] }}
            transition={reduce ? { duration: 0 } : { duration: 0.5, repeat: Infinity }}
            style={{ transformBox: "fill-box", transformOrigin: "50% 100%" }}
          >
            <path d="M206 44 L230 84 L182 84 Z" fill="#bda360" stroke="#8a7437" strokeWidth="3" strokeLinejoin="round" />
            <rect x="203.5" y="56" width="5" height="16" rx="2.5" fill="#0e1b2d" />
            <circle cx="206" cy="77" r="2.8" fill="#0e1b2d" />
          </motion.g>
        </motion.g>
      )}
      {pose === "working" && (
        <motion.g key="laptop" {...pop}>
          <path d="M84 178 L156 178 Q160 178 160 182 L160 212 L80 212 L80 182 Q80 178 84 178 Z" fill="#0e1b2d" />
          <circle cx="120" cy="195" r="7" fill={color} opacity="0.85" filter={`url(#${uid}-glow)`} />
          <path d="M72 212 L168 212 L162 222 L78 222 Z" fill="#4a5a6e" />
        </motion.g>
      )}
      {pose === "analyzing" && (
        <motion.g key="tablet" {...pop}>
          <rect x="82" y="174" width="76" height="58" rx="8" fill="#0e1b2d" stroke="#e8e2fb" strokeWidth="3" />
          <motion.path
            d="M90 220 L102 212 L112 216 L124 200 L134 204 L150 184"
            stroke="#bda360"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            initial={false}
            animate={reduce ? { pathLength: 1 } : { pathLength: [0, 1, 1] }}
            transition={reduce ? { duration: 0 } : { duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
          />
          <circle cx="150" cy="184" r="3.5" fill="#00a83e" />
        </motion.g>
      )}
      {pose === "guarding" && (
        <motion.g key="shield" {...pop}>
          <path d="M184 176 L208 184 L208 204 Q208 222 184 234 Q160 222 160 204 L160 184 Z" fill={VIOLET_LIGHT} stroke="#e8e2fb" strokeWidth="3.5" strokeLinejoin="round" />
          <path d="M172 204 L181 213 L197 195" stroke="#00a83e" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </motion.g>
      )}
      {pose === "point" && (
        <motion.g key="finger" {...pop}>
          <rect x="226" y="159" width="16" height="9" rx="4.5" fill={VIOLET_LIGHT} />
        </motion.g>
      )}
    </AnimatePresence>
  );
}

/**
 * The agent: the MyAlgoAgent logo mark come to life. The head is the icon
 * (white rounded square, violet round eyes, top antenna, ear tabs, bottom
 * stem as its neck), on a body in the logo's own violet. It has hands to
 * hold what it's working on, a chest screen and antenna light that show its
 * state, eyes that follow the cursor, and a pose for each job it does on the
 * platform. Everything loops only when motion is allowed.
 */
export default function Agent2D({
  pose = "idle",
  size = 180,
  trackCursor = true,
  crop = "full",
  className = "",
}: {
  pose?: AgentPose;
  size?: number;
  trackCursor?: boolean;
  /** "head" frames just the head (the logo mark) — for avatars and chips. */
  crop?: "full" | "head";
  className?: string;
}) {
  const reduce = !!useReducedMotion();
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const ref = useRef<SVGSVGElement>(null);
  const [blink, setBlink] = useState(false);

  const lookX = useSpring(0, { stiffness: 140, damping: 15 });
  const lookY = useSpring(0, { stiffness: 140, damping: 15 });
  const tilt = useSpring(0, { stiffness: 90, damping: 12 });

  const light = LIGHT[pose];
  const asleep = pose === "sleep";
  const busy = pose === "thinking" || pose === "working" || pose === "analyzing";
  const canTrack = trackCursor && !reduce && !asleep && !busy;

  useEffect(() => {
    // Busy poses look at their task, not at the cursor.
    const fixed: Partial<Record<AgentPose, Pt>> = { thinking: [-1, -1], working: [0, 5], analyzing: [0, 6] };
    const f = fixed[pose] ?? [0, 0];
    lookX.set(f[0]);
    lookY.set(f[1]);
    tilt.set(0);
    if (!canTrack) return;
    function onMove(e: PointerEvent) {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height * 0.3);
      const dist = Math.max(1, Math.hypot(dx, dy));
      const reach = Math.min(1, dist / 380);
      lookX.set((dx / dist) * 6 * reach);
      lookY.set((dy / dist) * 5 * reach);
      tilt.set(Math.max(-7, Math.min(7, dx / 80)));
    }
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [canTrack, pose, lookX, lookY, tilt]);

  useEffect(() => {
    if (reduce || asleep) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        setBlink(true);
        setTimeout(() => setBlink(false), 130);
        schedule();
      }, 2200 + Math.random() * 3200);
    };
    schedule();
    return () => clearTimeout(timer);
  }, [reduce, asleep]);

  const loop = (d: number) => (reduce ? { duration: 0 } : { duration: d, repeat: Infinity, ease: "easeInOut" as const });
  const hands = HANDS[pose];

  const bodyMotion = reduce
    ? { y: 0, x: 0 }
    : pose === "happy"
    ? { y: [0, -16, 0] }
    : pose === "alert"
    ? { x: [-1.5, 1.5, -1.5] }
    : asleep
    ? { y: [0, 2, 0] }
    : { y: [0, -5, 0] };
  const bodyTransition =
    reduce ? { duration: 0 } : pose === "happy" ? loop(0.7) : pose === "alert" ? { duration: 0.16, repeat: Infinity } : loop(asleep ? 4 : 3);

  return (
    <svg
      ref={ref}
      viewBox={crop === "head" ? "26 4 188 188" : "0 0 240 300"}
      width={size}
      height={crop === "head" ? size : size * 1.25}
      className={className}
      role="img"
      aria-label={`Agent, ${LABEL[pose]}`}
      style={{ overflow: crop === "head" ? "hidden" : "visible" }}
    >
      <defs>
        <linearGradient id={`${uid}-head`} x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0%" stopColor={HEAD} />
          <stop offset="100%" stopColor={HEAD_SHADE} />
        </linearGradient>
        <linearGradient id={`${uid}-body`} x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0%" stopColor={VIOLET_LIGHT} />
          <stop offset="55%" stopColor={VIOLET} />
          <stop offset="100%" stopColor={VIOLET_DARK} />
        </linearGradient>
        <linearGradient id={`${uid}-arm`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={VIOLET_LIGHT} />
          <stop offset="100%" stopColor={VIOLET} />
        </linearGradient>
        <radialGradient id={`${uid}-hand`} cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#ddd3f7" />
        </radialGradient>
        <radialGradient id={`${uid}-aura`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={light} stopOpacity="0.28" />
          <stop offset="100%" stopColor={light} stopOpacity="0" />
        </radialGradient>
        <filter id={`${uid}-glow`} x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id={`${uid}-soft`} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#2a0f63" floodOpacity="0.18" />
        </filter>
      </defs>

      <motion.circle cx="120" cy="140" r="130" fill={`url(#${uid}-aura)`} animate={reduce ? { opacity: 0.8 } : { opacity: [0.6, 1, 0.6] }} transition={loop(3.2)} />

      <motion.ellipse
        cx="120"
        cy="284"
        rx="60"
        ry="8"
        fill="#0e1b2d"
        opacity="0.14"
        animate={reduce ? { scaleX: 1 } : pose === "happy" ? { scaleX: [1, 0.7, 1] } : { scaleX: [1, 0.9, 1] }}
        transition={pose === "happy" ? loop(0.7) : loop(3)}
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
      />

      <motion.g animate={bodyMotion} transition={bodyTransition}>
        {/* legs & feet */}
        <rect x="92" y="236" width="20" height="30" rx="9" fill={VIOLET_DARK} />
        <rect x="128" y="236" width="20" height="30" rx="9" fill={VIOLET_DARK} />
        <rect x="82" y="258" width="36" height="17" rx="8.5" fill={VIOLET} />
        <rect x="122" y="258" width="36" height="17" rx="8.5" fill={VIOLET} />

        {/* body */}
        <rect x="68" y="156" width="104" height="90" rx="30" fill={`url(#${uid}-body)`} filter={`url(#${uid}-soft)`} />
        <path d="M84 168 Q100 160 118 162" stroke="#ffffff" strokeOpacity="0.3" strokeWidth="4.5" strokeLinecap="round" fill="none" />
        {/* chest screen */}
        <rect x="96" y="176" width="48" height="32" rx="9" fill="#0e1b2d" stroke="#466fff" strokeOpacity="0.4" strokeWidth="1.5" />
        <g filter={`url(#${uid}-glow)`}>
          <ChestScreen pose={pose} color={light} reduce={reduce} />
        </g>
        {/* belt line */}
        <rect x="80" y="220" width="80" height="5" rx="2.5" fill="#ffffff" opacity="0.12" />

        {/* head — the logo mark */}
        <motion.g style={{ rotate: tilt, transformBox: "view-box", transformOrigin: "120px 160px" }}>
          {/* neck: the logo's bottom stem */}
          <rect x="110" y="140" width="20" height="22" rx="7" fill={HEAD_SHADE} />
          {/* antenna: the logo's top stem, with a status bulb */}
          <motion.g
            animate={reduce ? { rotate: 0 } : { rotate: pose === "alert" ? [-9, 9, -9] : [-4, 4, -4] }}
            transition={pose === "alert" && !reduce ? { duration: 0.3, repeat: Infinity } : loop(3)}
            style={{ transformBox: "view-box", transformOrigin: "120px 42px" }}
          >
            <rect x="111" y="16" width="18" height="30" rx="9" fill={HEAD_SHADE} stroke="rgba(71,24,152,0.22)" strokeWidth="1.5" />
            <motion.circle
              cx="120"
              cy="14"
              r="8"
              fill={light}
              filter={`url(#${uid}-glow)`}
              animate={reduce ? { opacity: 1 } : pose === "alert" ? { opacity: [1, 0.2, 1] } : asleep ? { opacity: 0.35 } : { opacity: [0.75, 1, 0.75] }}
              transition={pose === "alert" && !reduce ? { duration: 0.45, repeat: Infinity } : loop(2)}
            />
          </motion.g>
          {/* ear tabs */}
          <rect x="36" y="66" width="22" height="54" rx="9" fill={`url(#${uid}-head)`} stroke="rgba(71,24,152,0.12)" strokeWidth="1.5" />
          <rect x="182" y="66" width="22" height="54" rx="9" fill={`url(#${uid}-head)`} stroke="rgba(71,24,152,0.12)" strokeWidth="1.5" />
          <motion.rect x="44" y="80" width="6" height="26" rx="3" fill={light} animate={reduce ? { opacity: 0.8 } : { opacity: [0.35, 1, 0.35] }} transition={loop(pose === "alert" ? 0.5 : 2.4)} />
          <motion.rect x="190" y="80" width="6" height="26" rx="3" fill={light} animate={reduce ? { opacity: 0.8 } : { opacity: [0.35, 1, 0.35] }} transition={loop(pose === "alert" ? 0.5 : 2.4)} />
          {/* head */}
          <rect x="56" y="36" width="128" height="116" rx="32" fill={`url(#${uid}-head)`} stroke="rgba(71,24,152,0.14)" strokeWidth="1.5" filter={`url(#${uid}-soft)`} />
          <ellipse cx="84" cy="52" rx="20" ry="7" fill="#ffffff" transform="rotate(-14 84 52)" />

          <motion.g style={{ x: lookX, y: lookY }}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.g
                key={pose === "happy" || pose === "sleep" ? pose : "open"}
                initial={reduce ? false : { scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.6, transition: { duration: 0.12 } }}
                transition={{ duration: 0.18 }}
                style={{ transformBox: "view-box", transformOrigin: "120px 92px" }}
              >
                <Eyes pose={pose} blink={blink} />
              </motion.g>
            </AnimatePresence>
            {/* the logo has no mouth — one appears only to talk or smile */}
            {pose === "talk" && (
              <motion.rect
                x="110"
                y="116"
                width="20"
                height="8"
                rx="4"
                fill={VIOLET}
                animate={reduce ? { scaleY: 1 } : { scaleY: [0.4, 1.3, 0.6, 1.1, 0.4] }}
                transition={reduce ? { duration: 0 } : { duration: 0.8, repeat: Infinity }}
                style={{ transformBox: "fill-box", transformOrigin: "center" }}
              />
            )}
            {pose === "happy" && <path d="M108 116 Q120 128 132 116" stroke={VIOLET} strokeWidth="5" strokeLinecap="round" fill="none" />}
          </motion.g>
        </motion.g>

        {/* arms and props — in front of head & body so every gesture reads.
            Held tools (magnifier, sign, tablet) go under the hands so the
            hands grip them; the laptop lid and shield go over the arms, as
            they would in real life. */}
        {!PROPS_OVER_ARMS.has(pose) && <Props pose={pose} color={light} reduce={reduce} uid={uid} />}
        <Arm shoulder={SHOULDER_L} pts={hands.l} dur={hands.dur} reduce={reduce} uid={uid} />
        <Arm shoulder={SHOULDER_R} pts={hands.r} dur={hands.dur} reduce={reduce} uid={uid} />
        {PROPS_OVER_ARMS.has(pose) && <Props pose={pose} color={light} reduce={reduce} uid={uid} />}
      </motion.g>

      {/* mood extras */}
      <AnimatePresence>
        {pose === "happy" &&
          [
            { x: 26, y: 60, c: "#bda360", d: 0 },
            { x: 214, y: 40, c: "#466fff", d: 0.3 },
            { x: 30, y: 150, c: "#00a83e", d: 0.6 },
            { x: 216, y: 176, c: "#471898", d: 0.9 },
          ].map((p) => (
            <motion.path
              key={p.x + p.y}
              d={`M${p.x} ${p.y - 10} l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3Z`}
              fill={p.c}
              initial={{ scale: 0, opacity: 0 }}
              animate={reduce ? { scale: 1, opacity: 1 } : { scale: [0, 1, 0], opacity: [0, 1, 0], rotate: [0, 90] }}
              exit={{ scale: 0, opacity: 0, transition: { duration: 0.15 } }}
              transition={reduce ? { duration: 0 } : { duration: 1.4, repeat: Infinity, delay: p.d }}
              style={{ transformBox: "fill-box", transformOrigin: "center" }}
            />
          ))}
        {pose === "sleep" &&
          [0, 1, 2].map((i) => (
            <motion.text
              key={i}
              x={176 + i * 11}
              y={40}
              fontSize={13 + i * 4}
              fontWeight="800"
              fill="#4a5a6e"
              initial={{ opacity: 0 }}
              animate={reduce ? { opacity: 0.8 } : { opacity: [0, 1, 0], y: [40, 18 - i * 6, 0 - i * 8] }}
              exit={{ opacity: 0, transition: { duration: 0.15 } }}
              transition={reduce ? { duration: 0 } : { duration: 2.4, repeat: Infinity, delay: i * 0.6 }}
            >
              z
            </motion.text>
          ))}
      </AnimatePresence>
    </svg>
  );
}
