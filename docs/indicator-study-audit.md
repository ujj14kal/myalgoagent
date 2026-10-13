# Indicator study audit (Logics folder: RSI, MACD, Bollinger Bands, VWAP, Fibonacci)

Checked 2026-10-13 against the five analyst study documents. "Phase 2" items are the studies' own later-phase items.

| Study | Item | Status |
|---|---|---|
| RSI | Wilder smoothing, period 14, 100 when no losses | Already correct |
| RSI | Flat price convention (study asks to pick and document one) | Fixed: a flat price keeps the previous reading (50 at the start) |
| RSI | Levels, crosses, zones, 50 midline, pullback zone | Built from comparisons and crosses with any number |
| RSI | "Turning up / down" slope | Added: RSI change over N bars |
| RSI | Source (hl2/hlc3), SMA/EMA smoothing, divergence, presets, RSI(2) recipe | Not built (divergence is phase 2); presets are not shipped as one-click templates |
| MACD | EMA(12,26,9), line/signal/histogram, crosses, zero line | Already correct |
| MACD | Reject fast >= slow | Added |
| MACD | Histogram rising / falling for N bars | Added: histogram change over N bars |
| MACD | PPO mode, MA type, source, divergence | Not built (phase 2) |
| Bollinger | SMA +/- K x population SD, (20, 2) | Already correct |
| Bollinger | %B, BandWidth, squeeze (percentile of lookback), Bollinger-inside-Keltner squeeze, middle-band slope | Added |
| Bollinger | W-bottom / M-top, MA type, source | Not built (phase 2) |
| VWAP | Restart every session, IST session day | Fixed: it ran over the whole loaded history before |
| VWAP | 1 and 2 SD bands (volume-weighted) | Added |
| VWAP | No value when the session has no volume (never a made-up number) | Fixed (it used to fall back to the typical price) |
| VWAP | Anchored VWAP | Exists as a chart drawing tool; not a rule indicator (phase 2) |
| VWAP | Daily candles | Each candle is its own session, so VWAP equals its typical price (as the study says) |
| Fibonacci | Retracements 38.2/50/61.8/78.6, extensions 1.272/1.618 from confirmed swings, no repaint, min swing size in ATR, invalidation, golden-zone flag, swing direction | Added (indicators-study.ts) |
| Fibonacci | Manual swing drawing | Already a chart drawing tool |
| Fibonacci | Multi-swing confluence clusters, harmonics, fans, expiry by age, manual swing in rules | Not built |
| All | Preset recipes as one-click templates | Not built; the AI agent can build any recipe from these pieces |
| All | Closed-bar only, higher-timeframe last-closed bar | Already how the engine works (see no-look-ahead tests) |

## Update 2026-10-13 (second pass): the remaining gaps were built

- Source (close / hl2 / hlc3 / ohlc4) on RSI, MACD and Bollinger; RSI smoothing (Wilder / SMA / EMA); MACD average type (EMA / SMA); Bollinger middle line (SMA / EMA / WMA). They are optional trailing settings, so every saved strategy is unchanged.
- PPO line, signal and histogram.
- RSI and MACD bullish and bearish divergence flags (confirmed `Right` candles after the second swing, pivots at most `Max bars` apart).
- Bollinger W-bottom and M-top flags.
- Anchored VWAP as rule indicators: weekly, monthly, from a date (YYYYMMDD), from the latest swing low or high.
- Fibonacci: cluster flag (levels of two or more of the last three swings within 0.3 ATR), swing age in candles, and manual-swing levels and golden-zone flag from prices typed in.
- 22 preset recipes in `lib/strategy/presets.ts`, offered on New Strategy ("Start from a ready-made recipe"): RSI (5), MACD (5), Bollinger (4), VWAP (4), Fibonacci (4).

Still not built, on purpose or for lack of data: the opening-range-breakout + VWAP recipe (the platform has no opening-range indicator), Fibonacci harmonics and fans (the study defers them), a standalone Fibonacci extension "target manager" (the staged Targets 1-3 and an exit rule on an extension level cover it), and VWAP execution slicing (the study keeps it out of the signal indicator).
