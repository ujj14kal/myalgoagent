// Inline SVG sprite: every marketing icon defined once as a <symbol>, used with <use>.
const P = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

const SYMBOLS: Record<string, React.ReactNode> = {
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  check: <path d="M5 12l5 5L19 7" />,
  braces: <path d="M8 4c-2 0-3 1-3 3v3c0 1-1 2-2 2 1 0 2 1 2 2v3c0 2 1 3 3 3M16 4c2 0 3 1 3 3v3c0 1 1 2 2 2-1 0-2 1-2 2v3c0 2-1 3-3 3" />,
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  layers: (
    <>
      <path d="M12 3l9 5-9 5-9-5 9-5Z" />
      <path d="M3 13l9 5 9-5" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  route: (
    <>
      <circle cx="5" cy="6" r="2" />
      <circle cx="19" cy="18" r="2" />
      <path d="M5 8v3a4 4 0 0 0 4 4h6a4 4 0 0 1 4 4" />
    </>
  ),
  radio: (
    <>
      <circle cx="12" cy="12" r="2" />
      <path d="M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M5.5 5.5a9 9 0 0 0 0 13M18.5 5.5a9 9 0 0 1 0 13" />
    </>
  ),
  gauge: (
    <>
      <path d="M12 12l4-4" />
      <path d="M4 15a8 8 0 1 1 16 0" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
  stop: (
    <>
      <circle cx="12" cy="12" r="9" />
      <rect x="9" y="9" width="6" height="6" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  plug: <path d="M9 2v6M15 2v6M7 8h10v4a5 5 0 0 1-10 0V8ZM12 17v5" />,
  pulse: <path d="M3 12h4l3-8 4 16 3-8h4" />,
  spark: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />,
  code: <path d="M8 6l-6 6 6 6M16 6l6 6-6 6" />,
  target: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  options: <path d="M3 20h18M5 20c3-9 5-13 7-13s4 4 7 13" />,
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </>
  ),
  log: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
};

export type IconName = keyof typeof SYMBOLS;

/** Put once per page. */
export function IconSprite() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden focusable="false">
      {Object.entries(SYMBOLS).map(([id, body]) => (
        <symbol key={id} id={`i-${id}`} viewBox="0 0 24 24" {...P}>
          {body}
        </symbol>
      ))}
    </svg>
  );
}

export function Ic({ name, size = 20, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} className={className} aria-hidden focusable="false">
      <use href={`#i-${name}`} />
    </svg>
  );
}
