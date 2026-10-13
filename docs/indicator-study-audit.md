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
