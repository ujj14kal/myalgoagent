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
  VWAP_UPPER_1: ["VWAP", "VWAP_LOWER_1"],
  VWAP_LOWER_1: ["VWAP", "VWAP_UPPER_1"],
  VWAP_UPPER_2: ["VWAP", "VWAP_LOWER_2"],
  VWAP_LOWER_2: ["VWAP", "VWAP_UPPER_2"],
  FIB_RET_382: ["FIB_RET_500", "FIB_RET_618"],
  FIB_RET_500: ["FIB_RET_382", "FIB_RET_618"],
  FIB_RET_618: ["FIB_RET_500", "FIB_RET_786"],
  FIB_RET_786: ["FIB_RET_618"],
  FIB_EXT_1272: ["FIB_EXT_1618"],
  FIB_EXT_1618: ["FIB_EXT_1272"],
  PPO_LINE: ["PPO_SIGNAL"],
  PPO_SIGNAL: ["PPO_LINE"],
  VWAP_WEEK: ["VWAP_MONTH"],
  VWAP_MONTH: ["VWAP_WEEK"],
  OPENING_RANGE_HIGH: ["OPENING_RANGE_LOW"],
  OPENING_RANGE_LOW: ["OPENING_RANGE_HIGH"],
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
  BB_PERCENT_B: [0, 1],
  BB_SQUEEZE: [1],
  BB_KC_SQUEEZE: [1],
  RSI_CHANGE: [0],
  MACD_HIST_CHANGE: [0],
  BB_MIDDLE_CHANGE: [0],
  FIB_GOLDEN_ZONE: [1],
  FIB_DIRECTION: [0],
  RSI_BULL_DIVERGENCE: [1],
  RSI_BEAR_DIVERGENCE: [1],
  MACD_BULL_DIVERGENCE: [1],
  MACD_BEAR_DIVERGENCE: [1],
  PPO_LINE: [0],
  PPO_SIGNAL: [0],
  PPO_HISTOGRAM: [0],
  BB_W_BOTTOM: [1],
  BB_M_TOP: [1],
  FIB_CONFLUENCE: [1],
  FIB_MANUAL_GOLDEN_ZONE: [1],
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
  BB_PERCENT_B: "Bollinger %B: where the close sits inside the bands. 0 = on the lower band, 1 = on the upper band, above 1 or below 0 = outside them. A flat price gives no value.",
  BB_BANDWIDTH: "Bollinger BandWidth (%): how wide the bands are compared with the average. Low = a quiet, squeezed market; high = an expanded, volatile one.",
  BB_SQUEEZE: "Bollinger squeeze: 1 while the bands are among the narrowest of the last N candles (the lowest few percent), otherwise 0. A squeeze shows quiet before a bigger move, but not which way. Needs the full lookback of history before it has a value.",
  BB_KC_SQUEEZE: "Squeeze (Bollinger inside Keltner): 1 while the Bollinger Bands sit completely inside the Keltner Channels, otherwise 0. The classic \"squeeze on\" signal; it ends when the bands move back outside.",
  VWAP_UPPER_1: "VWAP +1 SD: the volume-weighted average price plus one standard deviation of the day's volume-weighted prices. Restarts every session.",
  VWAP_LOWER_1: "VWAP −1 SD: the volume-weighted average price minus one standard deviation. Restarts every session.",
  VWAP_UPPER_2: "VWAP +2 SD: two standard deviations above VWAP. Price closing out here is stretched; it often drifts back toward VWAP on range days but can ride the band on strong trend days.",
  VWAP_LOWER_2: "VWAP −2 SD: two standard deviations below VWAP. A close back inside from here is a common mean-reversion entry on range days.",
  RSI_CHANGE: "RSI change over N bars: today's RSI minus its value N candles ago. Above zero = RSI turning or moving up; below zero = moving down.",
  MACD_HIST_CHANGE: "MACD histogram change over N bars: how much the histogram has grown or shrunk. Above zero = momentum building; below zero = fading. Negative bars that keep rising warn of a bullish shift before the lines cross.",
  BB_MIDDLE_CHANGE: "Bollinger middle band change over N bars: the average now minus the average N candles ago. Above zero = the middle band slopes up (a rising trend), below zero = down.",
  FIB_RET_382: "Fibonacci 38.2% retracement of the latest confirmed swing: a shallow pullback level in a strong trend. Swings are only counted once confirmed, so nothing repaints.",
  FIB_RET_500: "Fibonacci 50% retracement: the half-way pullback level, very widely watched. It is not a true Fibonacci ratio but is used everywhere.",
  FIB_RET_618: "Fibonacci 61.8% retracement (the golden ratio): a deep pullback, often seen as the last normal support before the trend is in doubt.",
  FIB_RET_786: "Fibonacci 78.6% retracement: a very deep pullback, a last-chance entry with a tight invalidation just beyond it.",
  FIB_EXT_1272: "Fibonacci 1.272 extension: a first profit target beyond the swing high (or low).",
  FIB_EXT_1618: "Fibonacci 1.618 extension: a second, further profit target beyond the swing.",
  FIB_GOLDEN_ZONE: "In the Fibonacci golden zone: 1 while the candle has pulled back into the 50%–61.8% zone of a valid swing (within 0.3 ATR), otherwise 0. Use it as the location, together with a trigger such as a reversal candle or RSI turning up.",
  RSI_BULL_DIVERGENCE: "RSI bullish divergence: 1 on the candle it is confirmed — price made a lower low but RSI made a higher low (selling momentum fading). It is a warning, not an entry: wait for a trigger. Confirmed a few candles after the second low, so it is never early.",
  RSI_BEAR_DIVERGENCE: "RSI bearish divergence: 1 on the candle it is confirmed — price made a higher high but RSI a lower high (buying momentum fading). A warning that needs confirmation.",
  MACD_BULL_DIVERGENCE: "MACD bullish divergence: 1 on the candle it is confirmed — price made a lower low but the MACD line a higher low. Best used as a warning with a confirming signal-line cross.",
  MACD_BEAR_DIVERGENCE: "MACD bearish divergence: 1 on the candle it is confirmed — price made a higher high but the MACD line a lower high.",
  PPO_LINE: "PPO line: MACD as a percent of the slow average, so it can be compared across stocks and price levels (raw MACD cannot).",
  PPO_SIGNAL: "PPO signal: a smoothed PPO line. The PPO line crossing it works like a MACD signal-line cross.",
  PPO_HISTOGRAM: "PPO histogram: PPO line minus its signal; growing bars mean strengthening momentum.",
  BB_W_BOTTOM: "Bollinger W-bottom: 1 on the candle it is confirmed — the first low touched or pierced the lower band, the second low is higher and stays inside the band. Bollinger's own reversal pattern.",
  BB_M_TOP: "Bollinger M-top: 1 on the candle it is confirmed — the first high touched or pierced the upper band, the second high is lower and stays inside the band.",
  VWAP_WEEK: "Weekly VWAP: the volume-weighted average price since Monday's open, restarting each week. A swing-trading fair-value line.",
  VWAP_MONTH: "Monthly VWAP: the volume-weighted average price since the start of the month, restarting each month.",
  VWAP_FROM_DATE: "Anchored VWAP from a date (type it as YYYYMMDD): the average price paid by everyone who bought since that day — a dynamic support or resistance line.",
  VWAP_SWING_LOW: "VWAP anchored at the latest confirmed swing low: the average cost since the last low, often support in an uptrend. It moves to the next swing low once that is confirmed.",
  VWAP_SWING_HIGH: "VWAP anchored at the latest confirmed swing high: the average cost since the last high, often resistance in a downtrend.",
  FIB_CONFLUENCE: "Fibonacci cluster: 1 when the close sits within 0.3 ATR of retracement levels from two or more of the last three swings. A level backed by several swings is treated as stronger.",
  FIB_SETUP_AGE: "Fibonacci swing age: how many candles since the current swing's end was confirmed. Use it to expire a setup, for example only act while the age is under 40.",
  FIB_MANUAL_RET_382: "38.2% retracement of a swing you type in (start price, end price): a flat line across the chart.",
  FIB_MANUAL_RET_500: "50% retracement of a swing you type in (start price, end price).",
  FIB_MANUAL_RET_618: "61.8% retracement of a swing you type in (start price, end price).",
  FIB_MANUAL_RET_786: "78.6% retracement of a swing you type in (start price, end price).",
  FIB_MANUAL_EXT_1272: "1.272 extension target of a swing you type in (start price, end price).",
  FIB_MANUAL_EXT_1618: "1.618 extension target of a swing you type in (start price, end price).",
  OPENING_RANGE_HIGH: "Opening range high: the highest price in the first N minutes after the 9:15 open (15 by default), known only once those minutes are over. A close above it is an opening-range breakout. Intraday candles only.",
  OPENING_RANGE_LOW: "Opening range low: the lowest price in the first N minutes after the open. A close below it is an opening-range breakdown. Intraday candles only.",
  FIB_MANUAL_GOLDEN_ZONE: "1 while a candle has pulled back into the 50%–61.8% zone of a swing you type in (within 0.3 ATR), otherwise 0.",
  FIB_DIRECTION: "Fibonacci swing direction: 1 after an up-swing (low then high), −1 after a down-swing, no value when there is no valid swing. The swing is void once price closes beyond its start.",
};

/** Settings used for the picture where the defaults find nothing on the short sample. */
const FIB_PICTURE = [3, 3, 1.5];
const PICTURE_PARAMS: Partial<Record<IndicatorKind, number[]>> = {
  SUPPORT: [2, 2, 2],
  RESISTANCE: [2, 2, 2],
  FIB_RET_382: FIB_PICTURE,
  FIB_RET_500: FIB_PICTURE,
  FIB_RET_618: FIB_PICTURE,
  FIB_RET_786: FIB_PICTURE,
  FIB_EXT_1272: FIB_PICTURE,
  FIB_EXT_1618: FIB_PICTURE,
  FIB_GOLDEN_ZONE: FIB_PICTURE,
  FIB_DIRECTION: FIB_PICTURE,
  BB_SQUEEZE: [20, 2, 40, 25],
  RSI_BULL_DIVERGENCE: [14, 3, 3, 40],
  RSI_BEAR_DIVERGENCE: [14, 3, 3, 40],
  MACD_BULL_DIVERGENCE: [12, 26, 9, 3, 3, 40],
  MACD_BEAR_DIVERGENCE: [12, 26, 9, 3, 3, 40],
  BB_W_BOTTOM: [20, 2, 3, 3, 40],
  BB_M_TOP: [20, 2, 3, 3, 40],
  FIB_CONFLUENCE: FIB_PICTURE,
  FIB_SETUP_AGE: FIB_PICTURE,
  VWAP_SWING_LOW: [3, 3],
  VWAP_SWING_HIGH: [3, 3],
  FIB_MANUAL_RET_382: [100, 120],
  FIB_MANUAL_RET_500: [100, 120],
  FIB_MANUAL_RET_618: [100, 120],
  FIB_MANUAL_RET_786: [100, 120],
  FIB_MANUAL_EXT_1272: [100, 120],
  FIB_MANUAL_EXT_1618: [100, 120],
  FIB_MANUAL_GOLDEN_ZONE: [100, 125],
  VWAP_FROM_DATE: [20231106],
};

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
