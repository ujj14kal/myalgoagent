import type { ChartPatternKind } from "@/lib/chart-patterns";

// A small drawing of each chart pattern, shown next to it in the builder: the
// price path, the lines that define the pattern (neckline, trendlines…) and a
// dot where the rule fires — the breakout candle, exactly as the detector
// (lib/chart-patterns.ts) confirms it.

type Pt = [x: number, y: number]; // 0–100 each way; higher y = higher price
type Guide = { from: Pt; to: Pt; label?: string };
type Art = {
  bias: "Bullish" | "Bearish" | "Either way";
  path: Pt[];
  guides: Guide[];
  /** Where the rule fires, and which way the breakout goes. */
  signal: { at: Pt; dir: "up" | "down" };
  labels?: { at: Pt; text: string }[];
  text: string;
};

const mirror = (a: Art, bias: Art["bias"], text: string): Art => ({
  bias,
  text,
  path: a.path.map(([x, y]) => [x, 100 - y]),
  guides: a.guides.map((g) => ({ ...g, from: [g.from[0], 100 - g.from[1]], to: [g.to[0], 100 - g.to[1]] })),
  signal: { at: [a.signal.at[0], 100 - a.signal.at[1]], dir: a.signal.dir === "up" ? "down" : "up" },
  labels: a.labels?.map((l) => ({ ...l, at: [l.at[0], 100 - l.at[1]] })),
});

/** Points along a smooth U (or ∩ when flipped) for the rounding patterns. */
const bowl = (flip = false): Pt[] => {
  const pts: Pt[] = Array.from({ length: 12 }, (_, i) => {
    const x = i * 8;
    const y = 25 + 0.018 * (x - 50) ** 2;
    return [x, flip ? 100 - y : y];
  });
  // …and on through the start level, where the rule fires.
  pts.push([100, flip ? 18 : 82]);
  return pts;
};

const HS: Art = {
  bias: "Bearish",
  path: [[0, 30], [12, 60], [22, 45], [38, 86], [52, 45], [64, 62], [76, 43], [88, 25], [100, 18]],
  guides: [{ from: [16, 45], to: [92, 45], label: "Neckline" }],
  signal: { at: [77, 42], dir: "down" },
  labels: [
    { at: [12, 66], text: "Shoulder" },
    { at: [38, 92], text: "Head" },
    { at: [64, 68], text: "Shoulder" },
  ],
  text: "Three peaks with the middle one highest. The rule fires when price breaks below the neckline joining the two dips — often the end of an uptrend.",
};

const DT: Art = {
  bias: "Bearish",
  path: [[0, 25], [18, 78], [32, 52], [48, 78], [62, 50], [75, 30], [100, 20]],
  guides: [
    { from: [24, 52], to: [80, 52], label: "Neckline" },
    { from: [10, 78], to: [56, 78] },
  ],
  signal: { at: [63, 49], dir: "down" },
  text: "Price hits the same high twice and fails. The rule fires when it breaks below the dip between the two tops.",
};

const TT: Art = {
  bias: "Bearish",
  path: [[0, 25], [14, 78], [24, 54], [38, 78], [48, 54], [62, 78], [74, 52], [84, 32], [100, 22]],
  guides: [
    { from: [18, 54], to: [88, 54], label: "Neckline" },
    { from: [8, 78], to: [68, 78] },
  ],
  signal: { at: [75, 50], dir: "down" },
  text: "Three failed attempts at the same high. The rule fires when price breaks below the support under them.",
};

const WEDGE_UP: Art = {
  bias: "Bearish",
  path: [[0, 15], [14, 45], [24, 32], [40, 62], [50, 50], [64, 74], [72, 64], [84, 82], [92, 76], [100, 48]],
  guides: [
    { from: [8, 28], to: [96, 80] },
    { from: [8, 40], to: [96, 86] },
  ],
  signal: { at: [93, 74], dir: "down" },
  text: "Price climbs inside two rising lines that squeeze together — buyers are tiring. The rule fires on the break below the lower line.",
};

const FLAG_UP: Art = {
  bias: "Bullish",
  path: [[0, 15], [20, 76], [28, 64], [34, 72], [42, 60], [50, 67], [58, 55], [66, 62], [76, 84], [100, 94]],
  guides: [
    { from: [20, 76], to: [70, 60], label: "Flag" },
    { from: [26, 63], to: [66, 51] },
  ],
  signal: { at: [69, 67], dir: "up" },
  labels: [{ at: [4, 46], text: "Pole" }],
  text: "A sharp rise (the pole), then a short, gently falling pause (the flag). The rule fires when price breaks out above the flag.",
};

const ART: Record<ChartPatternKind, Art> = {
  HEAD_AND_SHOULDERS: HS,
  INVERSE_HEAD_AND_SHOULDERS: {
    ...mirror(HS, "Bullish", "Three dips with the middle one deepest. The rule fires when price breaks above the neckline joining the two peaks — often the end of a downtrend."),
    labels: [
      { at: [12, 30], text: "Shoulder" },
      { at: [38, 6], text: "Head" },
      { at: [64, 30], text: "Shoulder" },
    ],
  },
  DOUBLE_TOP: DT,
  DOUBLE_BOTTOM: mirror(DT, "Bullish", "Price finds the same low twice and holds. The rule fires when it breaks above the peak between the two bottoms."),
  TRIPLE_TOP: TT,
  TRIPLE_BOTTOM: mirror(TT, "Bullish", "Three bounces from the same low. The rule fires when price breaks above the resistance over them."),
  ASCENDING_TRIANGLE: {
    bias: "Bullish",
    path: [[0, 30], [14, 75], [26, 42], [40, 75], [52, 54], [64, 75], [74, 64], [84, 75], [100, 92]],
    guides: [
      { from: [8, 75], to: [90, 75], label: "Resistance" },
      { from: [18, 37], to: [88, 71] },
    ],
    signal: { at: [87, 79], dir: "up" },
    text: "A flat ceiling with rising lows — buyers keep stepping in higher. The rule fires when price breaks above the ceiling.",
  },
  DESCENDING_TRIANGLE: {
    bias: "Bearish",
    path: [[0, 70], [14, 25], [26, 58], [40, 25], [52, 46], [64, 25], [74, 36], [84, 25], [100, 8]],
    guides: [
      { from: [8, 25], to: [90, 25], label: "Support" },
      { from: [18, 63], to: [88, 29] },
    ],
    signal: { at: [87, 21], dir: "down" },
    text: "A flat floor with falling highs — sellers keep pushing lower. The rule fires when price breaks below the floor.",
  },
  SYMMETRICAL_TRIANGLE: {
    bias: "Either way",
    path: [[0, 50], [10, 85], [22, 20], [36, 75], [48, 32], [60, 66], [70, 42], [78, 58], [86, 66], [100, 84]],
    guides: [
      { from: [6, 87], to: [90, 52] },
      { from: [16, 17], to: [90, 50] },
    ],
    signal: { at: [85, 63], dir: "up" },
    text: "Highs and lows squeeze together into a point. The rule fires on a breakout either way — here upward; it fires just the same on a break downward.",
  },
  RISING_WEDGE: WEDGE_UP,
  FALLING_WEDGE: mirror(WEDGE_UP, "Bullish", "Price falls inside two falling lines that squeeze together — sellers are tiring. The rule fires on the break above the upper line."),
  BULL_FLAG: FLAG_UP,
  BEAR_FLAG: {
    ...mirror(FLAG_UP, "Bearish", "A sharp fall (the pole), then a short, gently rising pause (the flag). The rule fires when price breaks down below the flag."),
    labels: [{ at: [4, 54], text: "Pole" }],
  },
  PENNANT: {
    bias: "Bullish",
    path: [[0, 15], [22, 78], [30, 62], [38, 74], [46, 64], [54, 71], [60, 66], [66, 69], [78, 88], [100, 95]],
    guides: [
      { from: [22, 78], to: [70, 68] },
      { from: [28, 61], to: [70, 67] },
    ],
    signal: { at: [70, 72], dir: "up" },
    labels: [{ at: [4, 46], text: "Pole" }],
    text: "A sharp rise, then a small triangle that narrows to a point. The rule fires when price breaks out upward.",
  },
  RECTANGLE: {
    bias: "Either way",
    path: [[0, 40], [12, 70], [24, 30], [38, 70], [52, 30], [66, 70], [78, 30], [90, 70], [100, 88]],
    guides: [
      { from: [6, 70], to: [94, 70], label: "Resistance" },
      { from: [6, 30], to: [94, 30], label: "Support" },
    ],
    signal: { at: [93, 76], dir: "up" },
    text: "Price bounces between a flat ceiling and a flat floor. The rule fires when it breaks out of the range — up (shown) or down.",
  },
  CUP_AND_HANDLE: {
    bias: "Bullish",
    path: [[0, 76], [10, 60], [22, 38], [36, 30], [50, 38], [62, 60], [70, 76], [76, 66], [82, 69], [90, 82], [100, 92]],
    guides: [{ from: [0, 76], to: [92, 76], label: "Rim" }],
    signal: { at: [87, 78], dir: "up" },
    labels: [
      { at: [34, 22], text: "Cup" },
      { at: [76, 58], text: "Handle" },
    ],
    text: "A rounded dip (the cup), a small pullback (the handle), then a break above the rim — where the rule fires.",
  },
  ROUNDING_BOTTOM: {
    bias: "Bullish",
    path: bowl(),
    guides: [{ from: [0, 70], to: [100, 70], label: "Start level" }],
    signal: { at: [95, 70], dir: "up" },
    text: "A slow, U-shaped turn from falling to rising. The rule fires when price gets back above where the decline began.",
  },
  ROUNDING_TOP: {
    bias: "Bearish",
    path: bowl(true),
    guides: [{ from: [0, 30], to: [100, 30], label: "Start level" }],
    signal: { at: [95, 30], dir: "down" },
    text: "A slow, dome-shaped turn from rising to falling. The rule fires when price drops back below where the rise began.",
  },
};

export default function ChartPatternIllustration({ pattern }: { pattern: ChartPatternKind }) {
  const art = ART[pattern];
  const W = 200;
  const H = 110;
  const pad = 10;
  const px = (x: number) => pad + (x / 100) * (W - pad * 2);
  const py = (y: number) => pad + ((100 - y) / 100) * (H - pad * 2);
  const up = art.signal.dir === "up";
  const [sx, sy] = art.signal.at;
  const biasCls =
    art.bias === "Bullish" ? "bg-brand-buy/10 text-brand-buy" : art.bias === "Bearish" ? "bg-brand-sell/10 text-brand-sell" : "bg-brand-navy/5 text-brand-navy/60";

  return (
    <div className="flex items-center gap-3 rounded-xl bg-white p-2.5 ring-1 ring-black/5">
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="shrink-0" role="img" aria-label={`${pattern.replace(/_/g, " ").toLowerCase()} illustration`}>
        {art.guides.map((g, i) => (
          <g key={i} className="text-brand-primary">
            <line x1={px(g.from[0])} y1={py(g.from[1])} x2={px(g.to[0])} y2={py(g.to[1])} stroke="currentColor" strokeOpacity={0.55} strokeWidth={1.2} strokeDasharray="4 3" />
            {g.label && (
              <text x={px(g.from[0])} y={py(g.from[1]) - 3} fontSize={7} fill="currentColor" fontWeight={600}>
                {g.label}
              </text>
            )}
          </g>
        ))}
        <polyline
          points={art.path.map(([x, y]) => `${px(x)},${py(y)}`).join(" ")}
          fill="none"
          className="text-brand-navy/70"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {art.labels?.map((l, i) => (
          <text key={i} x={px(l.at[0])} y={py(l.at[1])} fontSize={7} textAnchor="middle" className="fill-brand-navy/45">
            {l.text}
          </text>
        ))}
        <g className={up ? "text-brand-buy" : "text-brand-sell"}>
          <circle cx={px(sx)} cy={py(sy)} r={4.5} fill="currentColor" fillOpacity={0.2} />
          <circle cx={px(sx)} cy={py(sy)} r={2.4} fill="currentColor" />
          <text x={px(sx)} y={up ? py(sy) - 8 : py(sy) + 13} fontSize={7} textAnchor="middle" fill="currentColor" fontWeight={700}>
            Rule fires
          </text>
        </g>
      </svg>
      <div className="min-w-0 text-xs leading-relaxed text-brand-navy/70">
        <span className={`mb-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${biasCls}`}>{art.bias}</span>
        <p>{art.text}</p>
      </div>
    </div>
  );
}
