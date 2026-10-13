// Every NSE-listed equity (EQ series), the main BSE equities (groups A and B) and the main indices, from the public
// instrument masters (Dhan's daily list — the same file live orders use).
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
    // NSE's own test scrips (011NSETEST, G1NSETEST…) aren't real stocks.
    if (/NSETEST$/.test(sym)) continue;
    const name = (iDisplay >= 0 && f[iDisplay]?.trim()) || (iName >= 0 && titleCase(f[iName]?.trim() ?? "")) || sym;
    out.set(sym, { symbol: `${sym}.NS`, name, exchange: "NSE" });
  }
  return [...out.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
}

/** BSE series that are the main, actively traded cash segment (groups A and B). The rest — F, X, T, Z… — are thinly traded, trade-for-trade or debt. */
const BSE_SERIES = new Set(["A", "B"]);

/** BSE equities in groups A and B from the exchange master, one per symbol, stored Yahoo-style ("RELIANCE.BO"). */
export function parseBseUniverseCsv(csv: string): UniverseRow[] {
  const lines = csv.split(/\r?\n/);
  const head = lines[0].split(",");
  const col = (name: string) => head.indexOf(name);
  const [iExch, iSym, iSeries, iInstr, iDisplay, iName] = ["EXCH_ID", "UNDERLYING_SYMBOL", "SERIES", "INSTRUMENT", "DISPLAY_NAME", "SYMBOL_NAME"].map(col);
  if (iSym < 0 || iSeries < 0) throw new Error("BSE master: unexpected columns");
  const out = new Map<string, UniverseRow>();
  for (const line of lines.slice(1)) {
    const f = line.split(",");
    if (f.length < head.length / 2) continue;
    if (iExch >= 0 && f[iExch] !== "BSE") continue;
    if (iInstr >= 0 && f[iInstr] !== "EQUITY") continue;
    if (!BSE_SERIES.has(f[iSeries])) continue;
    const sym = f[iSym]?.trim().toUpperCase();
    if (!sym || !/^[A-Z0-9&-]+$/.test(sym)) continue;
    const name = (iDisplay >= 0 && f[iDisplay]?.trim()) || (iName >= 0 && titleCase(f[iName]?.trim() ?? "")) || sym;
    // The master also lists mutual-fund scheme units (e.g. "08ABB" Nippon India Mutual Fund): they are not stocks and crowd every picker.
    if (/mutual fund/i.test(name) || (iName >= 0 && /mutual fund/i.test(f[iName] ?? ""))) continue;
    out.set(sym, { symbol: `${sym}.BO`, name, exchange: "BSE" });
  }
  return [...out.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
}
