import type { VolumePatternKind } from "@/lib/volume-patterns";

// A small drawing of each volume pattern, shown next to it in the builder:
// price on top, volume bars (with their average) or OBV below, and the candle
// where the rule fires — as the detector (lib/volume-patterns.ts) sees it.

type Art = {
  bias: "Bullish" | "Bearish" | "Neutral";
  /** Price path, 0–100 (higher = higher price), one value per candle. */
  price: number[];
  /** Volume per candle (bars), or an OBV line when `obv` is set. */
  volume?: number[];
  obv?: number[];
  /** The candle where the rule fires. */
  fire: number;
  /** Price guide (e.g. the recent high the breakout clears). */
  priceLine?: { y: number; label: string };
  /** Divergence: the two swing points on price and on OBV. */
  divergence?: { at: [number, number] };
  text: string;
};

const avg = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;

const ART: Record<VolumePatternKind, Art> = {
  VOLUME_SPIKE: {
    bias: "Neutral",
    price: [50, 52, 49, 51, 53, 50, 52, 51, 64, 66, 63],
    volume: [3, 4, 3, 4, 3, 3, 4, 3, 9, 5, 4],
    fire: 8,
    text: "Volume at least twice its recent (20-candle) average — something big is happening. Pair it with a price rule to know which way.",
  },
  VOLUME_DRY_UP: {
    bias: "Neutral",
    price: [60, 57, 55, 54, 53, 53, 52, 52, 52, 53, 53],
    volume: [7, 6, 6, 5, 6, 5, 5, 2, 3, 4, 5],
    fire: 7,
    text: "Volume at half its recent average or less — interest has faded. Quiet pauses like this often come before a bigger move.",
  },
  BULLISH_VOLUME_BREAKOUT: {
    bias: "Bullish",
    price: [48, 55, 50, 56, 51, 54, 50, 55, 70, 74, 72],
    volume: [3, 4, 3, 4, 3, 3, 4, 3, 9, 6, 4],
    fire: 8,
    priceLine: { y: 56, label: "Recent high" },
    text: "Price closes above its recent (20-candle) high on at least twice the usual volume — a breakout with real buying behind it.",
  },
  BEARISH_VOLUME_BREAKDOWN: {
    bias: "Bearish",
    price: [52, 45, 50, 44, 49, 46, 50, 45, 30, 26, 28],
    volume: [3, 4, 3, 4, 3, 3, 4, 3, 9, 6, 4],
    fire: 8,
    priceLine: { y: 44, label: "Recent low" },
    text: "Price closes below its recent (20-candle) low on at least twice the usual volume — a breakdown with real selling behind it.",
  },
  OBV_BULLISH_DIVERGENCE: {
    bias: "Bullish",
    price: [70, 55, 42, 50, 58, 48, 36, 44, 52, 58, 62],
    obv: [60, 45, 30, 40, 50, 42, 38, 46, 55, 62, 66],
    fire: 9,
    divergence: { at: [2, 6] },
    text: "Price makes a lower low but volume flow (OBV) makes a higher low — selling is drying up. The rule fires when the second low is confirmed.",
  },
  OBV_BEARISH_DIVERGENCE: {
    bias: "Bearish",
    price: [30, 45, 58, 50, 42, 52, 64, 56, 48, 42, 38],
    obv: [40, 55, 70, 60, 50, 58, 62, 54, 45, 38, 34],
    fire: 9,
    divergence: { at: [2, 6] },
    text: "Price makes a higher high but volume flow (OBV) makes a lower high — buying is fading. The rule fires when the second high is confirmed.",
  },
};

export default function VolumePatternIllustration({ pattern }: { pattern: VolumePatternKind }) {
  const art = ART[pattern];
  const W = 200;
  const H = 110;
  const n = art.price.length;
  const step = (W - 20) / n;
  const cx = (i: number) => 10 + step * (i + 0.5);
  // Top panel: price (y 8–56); bottom panel: volume/OBV (y 64–104).
  const lo = Math.min(...art.price) - 4;
  const hi = Math.max(...art.price) + 4;
  const py = (v: number) => 8 + ((hi - v) / (hi - lo)) * 48;
  const up = art.bias !== "Bearish";
  const fireCls = art.bias === "Bearish" ? "text-brand-sell" : art.bias === "Bullish" ? "text-brand-buy" : "text-brand-primary";
  const biasCls =
    art.bias === "Bullish" ? "bg-brand-buy/10 text-brand-buy" : art.bias === "Bearish" ? "bg-brand-sell/10 text-brand-sell" : "bg-brand-navy/5 text-brand-navy/60";

  let bottom: React.ReactNode = null;
  if (art.volume) {
    const vmax = Math.max(...art.volume);
    const vy = (v: number) => 104 - (v / vmax) * 38;
    const average = avg(art.volume.slice(0, art.fire));
    bottom = (
      <>
        {art.volume.map((v, i) => (
          <rect
            key={i}
            x={cx(i) - step * 0.32}
            y={vy(v)}
            width={step * 0.64}
            height={104 - vy(v)}
            rx={1}
            className={i === art.fire ? fireCls : "text-brand-navy/20"}
            fill="currentColor"
          />
        ))}
        <line x1={10} x2={W - 10} y1={vy(average)} y2={vy(average)} className="text-brand-primary" stroke="currentColor" strokeOpacity={0.55} strokeDasharray="4 3" />
        <text x={12} y={vy(average) - 2} fontSize={7} className="fill-brand-primary" fontWeight={600}>
          Average volume
        </text>
      </>
    );
  } else if (art.obv) {
    const olo = Math.min(...art.obv) - 4;
    const ohi = Math.max(...art.obv) + 4;
    const oy = (v: number) => 64 + ((ohi - v) / (ohi - olo)) * 40;
    const [a, b] = art.divergence!.at;
    bottom = (
      <>
        <polyline points={art.obv.map((v, i) => `${cx(i)},${oy(v)}`).join(" ")} fill="none" className="text-brand-primary" stroke="currentColor" strokeWidth={1.6} />
        <line x1={cx(a)} y1={oy(art.obv[a])} x2={cx(b)} y2={oy(art.obv[b])} className={fireCls} stroke="currentColor" strokeWidth={1.2} strokeDasharray="3 2" />
        <text x={12} y={72} fontSize={7} className="fill-brand-primary" fontWeight={600}>
          OBV
        </text>
      </>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-xl bg-white p-2.5 ring-1 ring-black/5">
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="shrink-0" role="img" aria-label={`${pattern.replace(/_/g, " ").toLowerCase()} illustration`}>
        <line x1={10} x2={W - 10} y1={60} y2={60} className="text-brand-navy/10" stroke="currentColor" />
        {art.priceLine && (
          <g className="text-brand-primary">
            <line x1={10} x2={cx(art.fire)} y1={py(art.priceLine.y)} y2={py(art.priceLine.y)} stroke="currentColor" strokeOpacity={0.55} strokeDasharray="4 3" />
            <text x={12} y={py(art.priceLine.y) + (up ? -3 : 9)} fontSize={7} fill="currentColor" fontWeight={600}>
              {art.priceLine.label}
            </text>
          </g>
        )}
        <polyline points={art.price.map((v, i) => `${cx(i)},${py(v)}`).join(" ")} fill="none" className="text-brand-navy/70" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" />
        {art.divergence && (
          <line
            x1={cx(art.divergence.at[0])}
            y1={py(art.price[art.divergence.at[0]])}
            x2={cx(art.divergence.at[1])}
            y2={py(art.price[art.divergence.at[1]])}
            className={fireCls}
            stroke="currentColor"
            strokeWidth={1.2}
            strokeDasharray="3 2"
          />
        )}
        {bottom}
        <g className={fireCls}>
          <line x1={cx(art.fire)} x2={cx(art.fire)} y1={6} y2={104} stroke="currentColor" strokeOpacity={0.25} />
          <circle cx={cx(art.fire)} cy={py(art.price[art.fire])} r={2.6} fill="currentColor" />
          <text x={Math.min(cx(art.fire), W - 26)} y={6} fontSize={7} textAnchor="middle" fill="currentColor" fontWeight={700}>
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
