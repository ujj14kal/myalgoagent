import type { CandlePatternKind } from "@/lib/candle-patterns";

// A small drawing of each candlestick pattern, shown next to it in the
// builder: the grey candles set the scene (the trend it usually appears
// after), the coloured ones are the pattern itself.

type OHLC = [open: number, high: number, low: number, close: number];
type Art = { bias: "Bullish" | "Bearish" | "Neutral"; after: "down" | "up" | "none"; candles: OHLC[]; text: string };

const ART: Record<CandlePatternKind, Art> = {
  DOJI: { bias: "Neutral", after: "none", candles: [[50, 62, 38, 50.6]], text: "Open and close are almost equal: buyers and sellers are in balance. Often a pause before the market turns." },
  SPINNING_TOP: { bias: "Neutral", after: "none", candles: [[47, 64, 35, 53]], text: "A small body with long wicks on both sides: indecision after a push in either direction." },
  HAMMER: { bias: "Bullish", after: "down", candles: [[52, 57, 30, 56]], text: "After a fall, sellers pushed price well down but buyers took it back up, leaving a long lower wick. A possible bottom." },
  INVERTED_HAMMER: { bias: "Bullish", after: "down", candles: [[32, 58, 31, 36]], text: "After a fall, buyers tried to push up (long upper wick). Signals selling pressure may be fading." },
  SHOOTING_STAR: { bias: "Bearish", after: "up", candles: [[70, 92, 65, 66]], text: "After a rise, buyers pushed up but were rejected, leaving a long upper wick. A possible top." },
  HANGING_MAN: { bias: "Bearish", after: "up", candles: [[88, 89, 62, 85]], text: "After a rise, a long lower wick shows sellers stepping in. A warning the uptrend may be tiring." },
  MARUBOZU_BULLISH: { bias: "Bullish", after: "none", candles: [[35, 75.5, 34.5, 75]], text: "A full green body with almost no wicks: buyers were in control from open to close." },
  MARUBOZU_BEARISH: { bias: "Bearish", after: "none", candles: [[75, 75.5, 34.5, 35]], text: "A full red body with almost no wicks: sellers were in control from open to close." },
  BULLISH_ENGULFING: { bias: "Bullish", after: "down", candles: [[46, 47, 37, 38], [36, 51, 35, 50]], text: "After a fall, a green candle completely covers the previous red one: buyers have taken over." },
  BEARISH_ENGULFING: { bias: "Bearish", after: "up", candles: [[60, 68, 59, 67], [69, 70, 56, 57]], text: "After a rise, a red candle completely covers the previous green one: sellers have taken over." },
  BULLISH_HARAMI: { bias: "Bullish", after: "down", candles: [[52, 53, 31, 32], [36, 43, 35, 42]], text: "After a fall, a small green candle sits inside the previous big red one: the selling is losing strength." },
  BEARISH_HARAMI: { bias: "Bearish", after: "up", candles: [[58, 81, 57, 80], [76, 77, 69, 70]], text: "After a rise, a small red candle sits inside the previous big green one: the buying is losing strength." },
  TWEEZER_TOP: { bias: "Bearish", after: "up", candles: [[70, 86, 69, 82], [82, 86, 71, 72]], text: "After a rise, two candles hit the same high and fail there: that price is acting as resistance." },
  TWEEZER_BOTTOM: { bias: "Bullish", after: "down", candles: [[45, 46, 29, 33], [33, 45, 29, 44]], text: "After a fall, two candles find the same low and hold: that price is acting as support." },
  MORNING_STAR: { bias: "Bullish", after: "down", candles: [[56, 57, 37, 38], [35, 37, 32, 34], [38, 56, 37, 55]], text: "After a fall: a big red candle, a small pause candle, then a big green one. A classic bottom reversal." },
  EVENING_STAR: { bias: "Bearish", after: "up", candles: [[59, 78, 58, 77], [80, 83, 78, 81], [77, 78, 60, 61]], text: "After a rise: a big green candle, a small pause candle, then a big red one. A classic top reversal." },
  THREE_WHITE_SOLDIERS: { bias: "Bullish", after: "down", candles: [[30, 41, 29, 40], [37, 49, 36, 48], [45, 58, 44, 57]], text: "Three strong green candles in a row, each closing higher: steady buying." },
  THREE_BLACK_CROWS: { bias: "Bearish", after: "up", candles: [[76, 77, 64, 65], [68, 69, 56, 57], [60, 61, 48, 49]], text: "Three strong red candles in a row, each closing lower: steady selling." },
  PIERCING_LINE: { bias: "Bullish", after: "down", candles: [[53, 54, 35, 36], [32, 47, 31, 46]], text: "After a fall, a green candle opens below the last low and closes above the middle of the red candle." },
  DARK_CLOUD_COVER: { bias: "Bearish", after: "up", candles: [[57, 77, 56, 76], [80, 81, 63, 64], ], text: "After a rise, a red candle opens above the last high and closes below the middle of the green candle." },
};

/** Three grey candles leading into the pattern, to show the trend it appears after. */
function contextCandles(after: Art["after"], firstOpen: number): OHLC[] {
  if (after === "none") return [];
  const s = after === "down" ? 1 : -1;
  return [18, 12, 6].map((d) => {
    const open = firstOpen + s * d;
    const close = open - s * 5;
    return [open, Math.max(open, close) + 1.5, Math.min(open, close) - 1.5, close] as OHLC;
  });
}

export default function CandlePatternIllustration({ pattern, atLevel }: { pattern: CandlePatternKind; atLevel?: "SUPPORT" | "RESISTANCE" }) {
  const art = ART[pattern];
  const ctx = contextCandles(art.after, art.candles[0][0]);
  const all = [...ctx, ...art.candles];
  const hi = Math.max(...all.map((c) => c[1]));
  const lo = Math.min(...all.map((c) => c[2]));
  const W = 184;
  const H = 104;
  const pad = 10;
  const step = 22;
  const bodyW = 12;
  const startX = (W - all.length * step) / 2 + step / 2;
  const y = (v: number) => pad + ((hi - v) / (hi - lo || 1)) * (H - pad * 2);

  const patternStart = startX + ctx.length * step - step / 2 + 2;
  const patternWidth = art.candles.length * step - 4;
  const levelY = atLevel === "SUPPORT" ? y(Math.min(...art.candles.map((c) => c[2]))) : atLevel === "RESISTANCE" ? y(Math.max(...art.candles.map((c) => c[1]))) : null;
  const biasCls = art.bias === "Bullish" ? "bg-brand-buy/10 text-brand-buy" : art.bias === "Bearish" ? "bg-brand-sell/10 text-brand-sell" : "bg-brand-navy/5 text-brand-navy/60";

  return (
    <div className="flex items-center gap-3 rounded-xl bg-white p-2.5 ring-1 ring-black/5">
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="shrink-0" role="img" aria-label={`${pattern.replace(/_/g, " ").toLowerCase()} illustration`}>
        <rect x={patternStart} y={3} width={patternWidth} height={H - 6} rx={6} className="fill-brand-primary/[0.05] stroke-brand-primary/25" strokeDasharray="3 3" />
        {levelY !== null && (
          <g className={atLevel === "SUPPORT" ? "text-brand-buy" : "text-brand-sell"}>
            <line x1={4} x2={W - 4} y1={levelY} y2={levelY} stroke="currentColor" strokeWidth={1.2} strokeDasharray="5 3" />
            <text x={6} y={atLevel === "SUPPORT" ? levelY + 10 : levelY - 4} fontSize={8} fill="currentColor" fontWeight={600}>
              {atLevel === "SUPPORT" ? "Support" : "Resistance"}
            </text>
          </g>
        )}
        {all.map(([o, h, l, c], i) => {
          const x = startX + i * step;
          const isContext = i < ctx.length;
          const up = c >= o;
          const cls = isContext ? "text-brand-navy/25" : up ? "text-brand-buy" : "text-brand-sell";
          const top = y(Math.max(o, c));
          const bodyH = Math.max(1.5, Math.abs(y(o) - y(c)));
          return (
            <g key={i} className={cls}>
              <line x1={x} x2={x} y1={y(h)} y2={y(l)} stroke="currentColor" strokeWidth={1.4} />
              <rect x={x - bodyW / 2} y={top} width={bodyW} height={bodyH} rx={1.5} fill="currentColor" />
            </g>
          );
        })}
      </svg>
      <div className="min-w-0 text-xs leading-relaxed text-brand-navy/70">
        <span className={`mb-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${biasCls}`}>{art.bias}</span>
        <p>{art.text}</p>
        {atLevel && (
          <p className="mt-1 text-brand-navy/55">
            Only counts when the candle forms at a {atLevel === "SUPPORT" ? "support" : "resistance"} level.
          </p>
        )}
      </div>
    </div>
  );
}
