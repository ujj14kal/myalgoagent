// NSE equity master: exchange token, ISIN and tick size for every NSE-listed
// equity, from Dhan's public instrument list (refreshed daily). The NSE token
// is the same number every broker uses for the stock — Dhan's securityId,
// Angel One's symboltoken, Alice Blue's instrumentId, 5paisa's ScripCode —
// and Upstox keys stocks by ISIN. Tick sizes vary by price band (₹0.05,
// ₹0.10, ₹1…), and an order price off the tick is rejected by the exchange.

export type NseEquity = { symbol: string; token: string; isin: string; tick: number; series: string };

export function parseDhanNseCsv(csv: string): Record<string, NseEquity> {
  const lines = csv.split(/\r?\n/);
  const head = lines[0].split(",");
  const col = (name: string) => head.indexOf(name);
  const [iId, iIsin, iSym, iSeries, iTick, iInstr] = ["SECURITY_ID", "ISIN", "UNDERLYING_SYMBOL", "SERIES", "TICK_SIZE", "INSTRUMENT"].map(col);
  if ([iId, iIsin, iSym, iSeries, iTick].some((i) => i < 0)) throw new Error("NSE master: unexpected columns");
  const out: Record<string, NseEquity> = {};
  for (const line of lines.slice(1)) {
    const f = line.split(",");
    if (f.length < head.length / 2) continue;
    if (iInstr >= 0 && f[iInstr] !== "EQUITY") continue;
    const series = f[iSeries];
    if (series !== "EQ" && series !== "BE") continue; // regular and trade-for-trade equities
    const symbol = f[iSym]?.toUpperCase();
    const token = f[iId];
    const tickPaise = Number(f[iTick]);
    if (!symbol || !/^\d+$/.test(token) || !Number.isFinite(tickPaise) || tickPaise <= 0) continue;
    // Keep the EQ listing when a symbol appears in both series.
    if (out[symbol] && out[symbol].series === "EQ") continue;
    out[symbol] = { symbol, token, isin: f[iIsin], tick: tickPaise / 100, series };
  }
  return out;
}

/** Round a price onto the stock's tick (down for buys below market, up for sells above). */
export function onTick(price: number, tick: number, dir: "down" | "up" | "nearest" = "nearest"): number {
  const steps = price / tick;
  const n = dir === "down" ? Math.floor(steps + 1e-9) : dir === "up" ? Math.ceil(steps - 1e-9) : Math.round(steps);
  return Math.round(n * tick * 100) / 100;
}
