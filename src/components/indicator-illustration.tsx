import type { Candle } from "@/lib/market-data";
import type { IndicatorKind } from "@/lib/strategy/types";
import { computeIndicatorSeries } from "@/lib/strategy/compute-series";
import { INDICATOR_BY_KIND, OSCILLATOR_KINDS } from "@/lib/strategy/indicator-catalog";

// A small picture of each indicator, drawn by the platform's own indicator
// code on a fixed sample price series — so it shows exactly what the
// indicator does. Price-scale indicators sit on the price line; oscillators
// get their own panel with the levels rules usually use (e.g. RSI 30 / 70).

/** 90 deterministic sample candles: swings with a mild uptrend and some volume variation. */
const SAMPLE: Candle[] = (() => {
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const out: Candle[] = [];
  let prev = 100;
  for (let i = 0; i < 90; i++) {
    const close = 100 + 9 * Math.sin(i / 8) + 3 * Math.sin(i / 3.1) + i * 0.12 + (rand() - 0.5) * 2;
    const open = prev;
    const high = Math.max(open, close) + rand() * 1.5;
    const low = Math.min(open, close) - rand() * 1.5;
    out.push({ time: 1_700_000_000 + i * 86_400, open, high, low, close, volume: Math.round(1000 + 800 * rand() + (Math.abs(close - open) > 2 ? 900 : 0)) });
    prev = close;
  }
  return out;
})();

/** Other lines drawn faintly alongside, for context. */
const COMPANIONS: Partial<Record<IndicatorKind, IndicatorKind[]>> = {
  BB_UPPER: ["BB_MIDDLE", "BB_LOWER"],
  BB_MIDDLE: ["BB_UPPER", "BB_LOWER"],
  BB_LOWER: ["BB_UPPER", "BB_MIDDLE"],
  KELTNER_UPPER: ["KELTNER_MIDDLE", "KELTNER_LOWER"],
  KELTNER_MIDDLE: ["KELTNER_UPPER", "KELTNER_LOWER"],
  KELTNER_LOWER: ["KELTNER_UPPER", "KELTNER_MIDDLE"],
  ENVELOPE_UPPER: ["ENVELOPE_LOWER"],
  ENVELOPE_LOWER: ["ENVELOPE_UPPER"],
  DONCHIAN_UPPER: ["DONCHIAN_LOWER"],
  DONCHIAN_LOWER: ["DONCHIAN_UPPER"],
  PIVOT_PP: ["PIVOT_R1", "PIVOT_S1"],
  PIVOT_R1: ["PIVOT_PP", "PIVOT_R2"],
  PIVOT_R2: ["PIVOT_R1", "PIVOT_R3"],
  PIVOT_R3: ["PIVOT_R2"],
  PIVOT_S1: ["PIVOT_PP", "PIVOT_S2"],
  PIVOT_S2: ["PIVOT_S1", "PIVOT_S3"],
  PIVOT_S3: ["PIVOT_S2"],
  SUPPORT: ["RESISTANCE"],
  RESISTANCE: ["SUPPORT"],
  MACD_LINE: ["MACD_SIGNAL"],
  MACD_SIGNAL: ["MACD_LINE"],
  STOCH_K: ["STOCH_D"],
  STOCH_D: ["STOCH_K"],
  PLUS_DI: ["MINUS_DI"],
  MINUS_DI: ["PLUS_DI"],
  ADX: ["PLUS_DI", "MINUS_DI"],
  AROON_UP: ["AROON_DOWN"],
  AROON_DOWN: ["AROON_UP"],
};

/** Levels rules commonly use for oscillators. */
const LEVELS: Partial<Record<IndicatorKind, number[]>> = {
  RSI: [30, 70],
  STOCH_K: [20, 80],
  STOCH_D: [20, 80],
  WILLIAMS_R: [-80, -20],
  MFI: [20, 80],
  CCI: [-100, 100],
  AROON_UP: [30, 70],
  AROON_DOWN: [30, 70],
  ADX: [25],
  MACD_LINE: [0],
  MACD_SIGNAL: [0],
  MACD_HISTOGRAM: [0],
  ROC: [0],
  AWESOME_OSCILLATOR: [0],
  CMF: [0],
};

const TEXT: Record<IndicatorKind, string> = {
  SMA: "Simple moving average: the average close over N candles. Smooths out noise; price or a faster average crossing it is a common trend signal.",
  EMA: "Exponential moving average: like the SMA but weights recent candles more, so it reacts faster. Popular in crossovers (e.g. EMA 9 above EMA 21).",
  WMA: "Weighted moving average: recent candles count more, in a straight line. Between an SMA and an EMA in speed.",
  HMA: "Hull moving average: very smooth and fast-reacting, with little lag. Good for spotting turns early.",
  RSI: "Relative Strength Index (0–100): momentum. Above 70 is often called overbought, below 30 oversold; rules often buy when it crosses back above 30.",
  MACD_LINE: "MACD line: the gap between a fast and a slow EMA. Above zero = upward momentum. Crossing its signal line is a classic entry.",
  MACD_SIGNAL: "MACD signal: a smoothed MACD line. When the MACD line crosses above it, momentum is turning up; below it, turning down.",
  MACD_HISTOGRAM: "MACD histogram: MACD line minus its signal. Crossing zero means the lines just crossed; growing bars mean strengthening momentum.",
  BB_UPPER: "Bollinger upper band: the average plus 2 standard deviations. Price at the upper band is stretched high; a close above it can mean a strong breakout.",
  BB_MIDDLE: "Bollinger middle band: the plain moving average the bands are built around — often used as a trend line or exit.",
  BB_LOWER: "Bollinger lower band: the average minus 2 standard deviations. Price at the lower band is stretched low — a common mean-reversion entry.",
  VWAP: "Volume-weighted average price: the average price weighted by volume. Intraday traders treat price above VWAP as strength, below as weakness.",
  ATR: "Average True Range: how much price typically moves per candle. Measures volatility, not direction — used to size stops (e.g. 2× ATR).",
  ADX: "ADX (0–100): trend strength, not direction. Above ~25 means a strong trend; low values mean a choppy, sideways market.",
  PLUS_DI: "+DI: strength of upward moves. +DI above −DI means buyers are in control; the cross is a trend signal.",
  MINUS_DI: "−DI: strength of downward moves. −DI above +DI means sellers are in control.",
  STOCH_K: "Stochastic %K (0–100): where the close sits within the recent high–low range. Above 80 is near the top of the range, below 20 near the bottom.",
  STOCH_D: "Stochastic %D: a smoothed %K. %K crossing %D near 20 or 80 is a common signal.",
  CCI: "Commodity Channel Index: how far price is from its average. Above +100 is unusually strong, below −100 unusually weak.",
  ROC: "Rate of change: the % move over N candles. Above zero = rising, below = falling; how far from zero shows momentum.",
  OBV: "On-Balance Volume: adds volume on up candles and subtracts it on down candles. Rising OBV shows buying pressure building.",
  DONCHIAN_UPPER: "Donchian upper: the highest high of the last N candles. A close above it is a breakout to new highs.",
  DONCHIAN_LOWER: "Donchian lower: the lowest low of the last N candles. A close below it is a breakdown to new lows.",
  PIVOT_PP: "Pivot point: yesterday's (high + low + close) ÷ 3 — today's balance level. Above it is bullish, below bearish.",
  PIVOT_R1: "Pivot R1: the first resistance level above the pivot — a common profit target or breakout level.",
  PIVOT_R2: "Pivot R2: the second resistance level — a stronger ceiling.",
  PIVOT_R3: "Pivot R3: the third resistance level — reached only on strong days.",
  PIVOT_S1: "Pivot S1: the first support level below the pivot — a common bounce or stop level.",
  PIVOT_S2: "Pivot S2: the second support level — a stronger floor.",
  PIVOT_S3: "Pivot S3: the third support level — reached only on weak days.",
  PSAR: "Parabolic SAR: dots that trail price. Dots below price = uptrend; when price crosses the dots, the trend has flipped. Often used as a trailing stop.",
  SUPERTREND: "Supertrend: a line that sits below price in an uptrend and above it in a downtrend. Price crossing it flips the trend.",
  WILLIAMS_R: "Williams %R (−100 to 0): like the Stochastic, upside down. Above −20 is near the top of the range, below −80 near the bottom.",
  MFI: "Money Flow Index (0–100): RSI that also counts volume. Above 80 overbought, below 20 oversold.",
  AWESOME_OSCILLATOR: "Awesome Oscillator: a fast minus a slow average of the candle midpoints. Crossing zero shows momentum changing direction.",
  AROON_UP: "Aroon Up (0–100): how recently the highest high was. Near 100 = new highs just happened (strong uptrend).",
  AROON_DOWN: "Aroon Down (0–100): how recently the lowest low was. Near 100 = new lows just happened (strong downtrend).",
  CMF: "Chaikin Money Flow: buying vs selling pressure weighted by volume. Above zero = accumulation, below = distribution.",
  KELTNER_UPPER: "Keltner upper channel: an EMA plus a multiple of ATR. A close above it signals a strong move up.",
  KELTNER_MIDDLE: "Keltner middle: the EMA the channel is built around.",
  KELTNER_LOWER: "Keltner lower channel: the EMA minus a multiple of ATR. A close below it signals a strong move down.",
  ENVELOPE_UPPER: "Envelope upper: the moving average plus a fixed %. Price above it is stretched high.",
  ENVELOPE_LOWER: "Envelope lower: the moving average minus a fixed %. Price below it is stretched low.",
  STDDEV: "Standard deviation: how widely closes vary around their average — a volatility measure. Rising values mean bigger swings.",
  SUPPORT: "Support level: the nearest price below where price has bounced up at least twice. Price tends not to fall far below it; a close under it is a breakdown.",
  RESISTANCE: "Resistance level: the nearest price above where price has failed to rise at least twice. A close above it is a breakout.",
};

/** Settings used for the picture where the defaults find nothing on the short sample. */
const PICTURE_PARAMS: Partial<Record<IndicatorKind, number[]>> = { SUPPORT: [2, 2, 2], RESISTANCE: [2, 2, 2] };

export default function IndicatorIllustration({ kind, params }: { kind: IndicatorKind; params?: number[] }) {
  const def = INDICATOR_BY_KIND.get(kind);
  if (!def) return null;
  const p = PICTURE_PARAMS[kind] ?? (params && params.length === def.defaults.length ? params : def.defaults);
  const panel = OSCILLATOR_KINDS.has(kind);
  const main = computeIndicatorSeries(SAMPLE, kind, p);
  const companions = (COMPANIONS[kind] ?? []).map((k) => ({
    kind: k,
    series: computeIndicatorSeries(SAMPLE, k, PICTURE_PARAMS[k] ?? INDICATOR_BY_KIND.get(k)?.defaults ?? []),
  }));
  const companionsHere = companions.filter((c) => OSCILLATOR_KINDS.has(c.kind) === panel);

  const W = 200;
  const H = 110;
  const t0 = SAMPLE[0].time;
  const t1 = SAMPLE[SAMPLE.length - 1].time;
  const x = (t: number) => 8 + ((t - t0) / (t1 - t0)) * (W - 16);

  // Price panel: full height, or the top part when the indicator has its own panel.
  const priceBottom = panel ? 58 : 104;
  const overlay = panel ? [] : [main, ...companionsHere.map((c) => c.series)];
  const priceVals = [...SAMPLE.flatMap((c) => [c.high, c.low]), ...overlay.flat().map((q) => q.value)];
  const pLo = Math.min(...priceVals);
  const pHi = Math.max(...priceVals);
  const py = (v: number) => 6 + ((pHi - v) / (pHi - pLo || 1)) * (priceBottom - 6);

  const levels = panel ? LEVELS[kind] ?? [] : [];
  const panelVals = panel ? [...main, ...companionsHere.flatMap((c) => c.series)].map((q) => q.value).concat(levels) : [];
  const oLo = panel ? Math.min(...panelVals) : 0;
  const oHi = panel ? Math.max(...panelVals) : 1;
  const oy = (v: number) => 66 + ((oHi - v) / (oHi - oLo || 1)) * 38;

  const line = (series: { time: number; value: number }[], y: (v: number) => number) => series.map((q) => `${x(q.time)},${y(q.value)}`).join(" ");
  const isDots = kind === "PSAR";
  const isHistogram = kind === "MACD_HISTOGRAM";

  return (
    <div className="flex items-center gap-3 rounded-xl bg-white p-2.5 ring-1 ring-black/5">
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="shrink-0" role="img" aria-label={`${def.label} illustration`}>
        <polyline points={SAMPLE.map((c) => `${x(c.time)},${py(c.close)}`).join(" ")} fill="none" className="text-brand-navy/45" stroke="currentColor" strokeWidth={1.3} />
        {!panel &&
          companionsHere.map((c) => (
            <polyline key={c.kind} points={line(c.series, py)} fill="none" className="text-brand-primary" stroke="currentColor" strokeOpacity={0.3} strokeWidth={1.2} />
          ))}
        {!panel &&
          (isDots ? (
            main.map((q, i) => <circle key={i} cx={x(q.time)} cy={py(q.value)} r={1.3} className="fill-brand-primary" />)
          ) : (
            <polyline points={line(main, py)} fill="none" className="text-brand-primary" stroke="currentColor" strokeWidth={1.9} />
          ))}
        {panel && (
          <>
            <line x1={8} x2={W - 8} y1={62} y2={62} className="text-brand-navy/10" stroke="currentColor" />
            {levels.map((lv) => (
              <g key={lv} className="text-brand-navy/40">
                <line x1={8} x2={W - 8} y1={oy(lv)} y2={oy(lv)} stroke="currentColor" strokeDasharray="3 3" />
                <text x={W - 9} y={oy(lv) - 1.5} fontSize={6.5} textAnchor="end" fill="currentColor">
                  {lv}
                </text>
              </g>
            ))}
            {companionsHere.map((c) => (
              <polyline key={c.kind} points={line(c.series, oy)} fill="none" className="text-brand-gold" stroke="currentColor" strokeOpacity={0.8} strokeWidth={1.2} />
            ))}
            {isHistogram
              ? main.map((q, i) => (
                  <rect
                    key={i}
                    x={x(q.time) - 0.8}
                    y={Math.min(oy(q.value), oy(0))}
                    width={1.6}
                    height={Math.abs(oy(q.value) - oy(0))}
                    className={q.value >= 0 ? "fill-brand-buy" : "fill-brand-sell"}
                  />
                ))
              : <polyline points={line(main, oy)} fill="none" className="text-brand-primary" stroke="currentColor" strokeWidth={1.7} />}
          </>
        )}
        <text x={9} y={panel ? 71 : 14} fontSize={7} className="fill-brand-primary" fontWeight={700}>
          {def.label}
        </text>
      </svg>
      <p className="min-w-0 text-xs leading-relaxed text-brand-navy/70">{TEXT[kind]}</p>
    </div>
  );
}
