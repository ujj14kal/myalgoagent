// A strategy's style says how long it expects to hold. Intraday is squared off the same day; swing (days to weeks) and
// positional / long-term (weeks to months) are held overnight, so they are delivery, long-only and run on daily candles.
// (Weekly and monthly are chart-only timeframes; a swing rule that needs the weekly trend reads it as another timeframe.)

export type StrategyStyle = "INTRADAY" | "SWING" | "POSITIONAL";
export const STRATEGY_STYLES: StrategyStyle[] = ["INTRADAY", "SWING", "POSITIONAL"];

export const STYLE_LABEL: Record<StrategyStyle, string> = { INTRADAY: "Intraday", SWING: "Swing", POSITIONAL: "Positional / long-term" };

export function parseStyle(v: unknown): StrategyStyle | null {
  return v === "INTRADAY" || v === "SWING" || v === "POSITIONAL" ? v : null;
}

/** What a strategy with no stated style is: delivery on daily candles is swing-like only if it says so, so the default follows the product. */
export function styleOf(row: { style?: string | null; productType?: string | null }): StrategyStyle {
  return parseStyle(row.style) ?? (row.productType === "INTRADAY" ? "INTRADAY" : "SWING");
}

/** Why a swing or positional strategy can't be saved with these settings, or null when it is fine. */
export function styleProblem(style: StrategyStyle | null | undefined, s: { timeframe: string; productType: string; direction: string }): string | null {
  if (style !== "SWING" && style !== "POSITIONAL") return null;
  const name = STYLE_LABEL[style].toLowerCase();
  if (s.timeframe !== "1d") return `A ${name} strategy runs on daily candles. It can still read a weekly or monthly trend as another timeframe inside its rules.`;
  if (s.productType !== "DELIVERY") return `A ${name} strategy is held overnight, so it must be a delivery product, not intraday.`;
  if (s.direction === "SHORT") return `A ${name} strategy is long only: the cash market doesn't allow holding a short overnight.`;
  return null;
}
