// A strategy's style says how long it expects to hold. Intraday is squared off the same day; swing (days to weeks) is
// held overnight, so it is delivery, long-only and runs on daily or weekly candles. (Monthly is a chart-only timeframe;
// a rule that needs the monthly trend reads it as another timeframe.)
//
// There is deliberately no "positional / long-term" style: holding an investment for months or years isn't an
// algorithmic strategy the engine manages. Strategies saved with the old POSITIONAL style read as swing — the same
// rules applied (daily or weekly candles, delivery, long only), so nothing about how they run changes.

export type StrategyStyle = "INTRADAY" | "SWING";
export const STRATEGY_STYLES: StrategyStyle[] = ["INTRADAY", "SWING"];

export const STYLE_LABEL: Record<StrategyStyle, string> = { INTRADAY: "Intraday", SWING: "Swing" };

export function parseStyle(v: unknown): StrategyStyle | null {
  if (v === "POSITIONAL") return "SWING"; // retired style, see above
  return v === "INTRADAY" || v === "SWING" ? v : null;
}

/** What a strategy with no stated style is: delivery on daily candles is swing-like only if it says so, so the default follows the product. */
export function styleOf(row: { style?: string | null; productType?: string | null }): StrategyStyle {
  return parseStyle(row.style) ?? (row.productType === "INTRADAY" ? "INTRADAY" : "SWING");
}

/** Why a swing strategy can't be saved with these settings, or null when it is fine. */
export function styleProblem(style: StrategyStyle | null | undefined, s: { timeframe: string; productType: string; direction: string }): string | null {
  if (style !== "SWING") return null;
  const name = STYLE_LABEL[style].toLowerCase();
  if (s.timeframe !== "1d" && s.timeframe !== "1wk") return `A ${name} strategy runs on daily or weekly candles. It can still read a monthly trend as another timeframe inside its rules.`;
  if (s.productType !== "DELIVERY") return `A ${name} strategy is held overnight, so it must be a delivery product, not intraday.`;
  if (s.direction === "SHORT") return `A ${name} strategy is long only: the cash market doesn't allow holding a short overnight.`;
  return null;
}
