// Every NSE-listed equity (EQ series) plus the main indices, from the public
// NSE instrument master (Dhan's daily list — the same file live orders use).
// Symbols are stored Yahoo-style ("RELIANCE.NS", "^NSEI") so every data
// source can serve them.

export type UniverseRow = { symbol: string; name: string; exchange: string };

/** The indices offered as instruments (Yahoo and TrueData both serve these). */
export const INDEX_INSTRUMENTS: UniverseRow[] = [
  { symbol: "^NSEI", name: "NIFTY 50", exchange: "NSE" },
  { symbol: "^NSEBANK", name: "NIFTY BANK", exchange: "NSE" },
  { symbol: "^CNXIT", name: "NIFTY IT", exchange: "NSE" },
  { symbol: "^BSESN", name: "S&P BSE SENSEX", exchange: "BSE" },
];

const titleCase = (s: string) => s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\bLtd\b/g, "Ltd");

/** Regular (EQ-series) NSE equities from the master CSV, one per symbol. */
export function parseUniverseCsv(csv: string): UniverseRow[] {
  const lines = csv.split(/\r?\n/);
  const head = lines[0].split(",");
  const col = (name: string) => head.indexOf(name);
  const [iSym, iSeries, iInstr, iDisplay, iName] = ["UNDERLYING_SYMBOL", "SERIES", "INSTRUMENT", "DISPLAY_NAME", "SYMBOL_NAME"].map(col);
  if (iSym < 0 || iSeries < 0) throw new Error("NSE master: unexpected columns");
  const out = new Map<string, UniverseRow>();
  for (const line of lines.slice(1)) {
    const f = line.split(",");
    if (f.length < head.length / 2) continue;
    if (iInstr >= 0 && f[iInstr] !== "EQUITY") continue;
    if (f[iSeries] !== "EQ") continue;
    const sym = f[iSym]?.trim().toUpperCase();
    if (!sym || !/^[A-Z0-9&-]+$/.test(sym)) continue;
    const name = (iDisplay >= 0 && f[iDisplay]?.trim()) || (iName >= 0 && titleCase(f[iName]?.trim() ?? "")) || sym;
    out.set(sym, { symbol: `${sym}.NS`, name, exchange: "NSE" });
  }
  return [...out.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
}
