// Extra views of a backtest, worked out from its trades and equity curve: day-by-day results, streaks, a
// monthly calendar, monthly returns, drawdown over time and how trade results are spread. Pure, so it's tested.

export type TradeLite = { exitTime: number; netPnl: number; netPnlPct: number; holdingBars?: number };
export type EquityLite = { time: number; equity: number };

/** IST calendar day (YYYY-MM-DD) of an epoch-seconds time. */
export const istDayOf = (t: number) => new Date((t + 19800) * 1000).toISOString().slice(0, 10);

export type DayResult = { day: string; pnl: number; trades: number };

export function dayResults(trades: TradeLite[]): DayResult[] {
  const by = new Map<string, DayResult>();
  for (const t of trades) {
    const day = istDayOf(t.exitTime);
    const d = by.get(day) ?? { day, pnl: 0, trades: 0 };
    d.pnl += t.netPnl;
    d.trades += 1;
    by.set(day, d);
  }
  return [...by.values()].sort((a, b) => (a.day < b.day ? -1 : 1)).map((d) => ({ ...d, pnl: round(d.pnl) }));
}

function longestRun<T>(items: T[], test: (x: T) => boolean): number {
  let best = 0;
  let run = 0;
  for (const x of items) {
    run = test(x) ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

export type Summary = {
  tradingDays: number;
  winDays: number;
  lossDays: number;
  totalTrades: number;
  winTrades: number;
  lossTrades: number;
  bestTrade: number;
  worstTrade: number;
  bestDay: number;
  worstDay: number;
  avgWin: number;
  avgLoss: number;
  longestWinStreak: number;
  longestLossStreak: number;
  /** Largest peak-to-trough fall in equity (₹) and its share of the peak (%). */
  maxDrawdown: number;
  maxDrawdownPct: number;
};

export function summarize(trades: TradeLite[], equity: EquityLite[]): Summary {
  const ordered = [...trades].sort((a, b) => a.exitTime - b.exitTime);
  const days = dayResults(ordered);
  const wins = ordered.filter((t) => t.netPnl > 0);
  const losses = ordered.filter((t) => t.netPnl < 0);
  const dd = drawdownSeries(equity);
  let maxDrawdown = 0;
  let maxDrawdownPct = 0;
  for (const p of dd) {
    if (p.drawdown > maxDrawdown) maxDrawdown = p.drawdown;
    if (p.pct > maxDrawdownPct) maxDrawdownPct = p.pct;
  }
  return {
    tradingDays: days.length,
    winDays: days.filter((d) => d.pnl > 0).length,
    lossDays: days.filter((d) => d.pnl < 0).length,
    totalTrades: ordered.length,
    winTrades: wins.length,
    lossTrades: losses.length,
    bestTrade: ordered.length ? Math.max(...ordered.map((t) => t.netPnl)) : 0,
    worstTrade: ordered.length ? Math.min(...ordered.map((t) => t.netPnl)) : 0,
    bestDay: days.length ? Math.max(...days.map((d) => d.pnl)) : 0,
    worstDay: days.length ? Math.min(...days.map((d) => d.pnl)) : 0,
    avgWin: wins.length ? round(wins.reduce((s, t) => s + t.netPnl, 0) / wins.length) : 0,
    avgLoss: losses.length ? round(losses.reduce((s, t) => s + t.netPnl, 0) / losses.length) : 0,
    longestWinStreak: longestRun(days, (d) => d.pnl > 0),
    longestLossStreak: longestRun(days, (d) => d.pnl < 0),
    maxDrawdown: round(maxDrawdown),
    maxDrawdownPct: round(maxDrawdownPct),
  };
}

export type DrawdownPoint = { time: number; drawdown: number; pct: number };

/** How far equity sits below its highest point so far, at each point. */
export function drawdownSeries(equity: EquityLite[]): DrawdownPoint[] {
  let peak = -Infinity;
  const out: DrawdownPoint[] = [];
  for (const p of [...equity].sort((a, b) => a.time - b.time)) {
    if (!Number.isFinite(p.equity)) continue;
    peak = Math.max(peak, p.equity);
    const dd = peak - p.equity;
    out.push({ time: p.time, drawdown: round(dd), pct: peak > 0 ? round((dd / peak) * 100) : 0 });
  }
  return out;
}

export type CalendarMonth = { key: string; label: string; pnl: number; /** Cells from the 1st: leading blanks, then each day with its result (null = no trade). */ cells: ({ day: number; pnl: number | null } | null)[] };

/** One block per month with a trade, oldest first. */
export function calendarMonths(days: DayResult[]): CalendarMonth[] {
  const months = new Map<string, DayResult[]>();
  for (const d of days) {
    const k = d.day.slice(0, 7);
    months.set(k, [...(months.get(k) ?? []), d]);
  }
  return [...months.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([key, list]) => {
      const [y, m] = key.split("-").map(Number);
      const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
      const length = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const byDay = new Map(list.map((d) => [Number(d.day.slice(8)), d.pnl]));
      const cells: CalendarMonth["cells"] = Array.from({ length: first }, () => null);
      for (let day = 1; day <= length; day++) cells.push({ day, pnl: byDay.get(day) ?? null });
      return { key, label: new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" }), pnl: round(list.reduce((s, d) => s + d.pnl, 0)), cells };
    });
}

export type MonthlyReturnRow = { year: number; months: (number | null)[]; total: number | null };

/** Equity change per calendar month, as a % of the equity at the month's start; rows by year. */
export function monthlyReturns(equity: EquityLite[]): MonthlyReturnRow[] {
  const pts = [...equity].filter((p) => Number.isFinite(p.equity)).sort((a, b) => a.time - b.time);
  if (pts.length < 2) return [];
  const byMonth = new Map<string, { first: number; last: number }>();
  let prevClose = pts[0].equity;
  for (const p of pts) {
    const k = istDayOf(p.time).slice(0, 7);
    const m = byMonth.get(k);
    if (!m) byMonth.set(k, { first: prevClose, last: p.equity });
    else m.last = p.equity;
    prevClose = p.equity;
  }
  const rows = new Map<number, MonthlyReturnRow>();
  for (const [k, v] of [...byMonth.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const [y, m] = k.split("-").map(Number);
    const row = rows.get(y) ?? { year: y, months: Array(12).fill(null), total: null };
    row.months[m - 1] = v.first > 0 ? round(((v.last - v.first) / v.first) * 100) : null;
    rows.set(y, row);
  }
  for (const row of rows.values()) {
    const done = row.months.filter((x): x is number => x !== null);
    row.total = done.length ? round((done.reduce((acc, r) => acc * (1 + r / 100), 1) - 1) * 100) : null;
  }
  return [...rows.values()].sort((a, b) => a.year - b.year);
}

export type Bucket = { from: number; to: number; count: number };

/** Trade results (₹) counted into `bins` equal-width buckets between the worst and the best. */
export function pnlDistribution(trades: TradeLite[], bins = 12): Bucket[] {
  if (!trades.length) return [];
  const values = trades.map((t) => t.netPnl);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  if (lo === hi) return [{ from: lo, to: hi, count: values.length }];
  const width = (hi - lo) / bins;
  const out: Bucket[] = Array.from({ length: bins }, (_, i) => ({ from: lo + i * width, to: lo + (i + 1) * width, count: 0 }));
  for (const v of values) out[Math.min(bins - 1, Math.floor((v - lo) / width))].count += 1;
  return out;
}

export type WeekColumn = { /** Monday of the week (YYYY-MM-DD). */ monday: string; /** Mon–Fri results: ₹ for a trading day, null for no trade. */ days: (number | null)[]; /** Month label when a new month starts in this column. */ month: string | null };

/** The trading week by week, Monday to Friday down the page — one column per week, in time order. Weeks with no trade at all in a quiet stretch are kept, so gaps show as gaps. */
export function weekColumns(days: DayResult[]): WeekColumn[] {
  if (!days.length) return [];
  const mondayOf = (day: string) => {
    const t = Date.parse(`${day}T00:00:00Z`);
    const dow = (new Date(t).getUTCDay() + 6) % 7; // Monday = 0
    return t - dow * 86_400_000;
  };
  const byDay = new Map(days.map((d) => [d.day, d.pnl]));
  const first = mondayOf(days[0].day);
  const last = mondayOf(days[days.length - 1].day);
  const out: WeekColumn[] = [];
  let prevMonth = "";
  for (let m = first; m <= last; m += 7 * 86_400_000) {
    const ds = Array.from({ length: 5 }, (_, i) => new Date(m + i * 86_400_000).toISOString().slice(0, 10));
    const month = ds[0].slice(0, 7);
    out.push({
      monday: ds[0],
      days: ds.map((d) => byDay.get(d) ?? null),
      month: month !== prevMonth ? new Date(m).toLocaleDateString("en-IN", { month: "short", year: month.slice(0, 4) !== prevMonth.slice(0, 4) ? "2-digit" : undefined, timeZone: "UTC" }) : null,
    });
    prevMonth = month;
  }
  return out;
}

/** Gross profit and gross loss of the trades, and the profit share of the two. */
export function profitSplit(trades: TradeLite[]): { profit: number; loss: number; share: number } {
  const profit = trades.filter((t) => t.netPnl > 0).reduce((s, t) => s + t.netPnl, 0);
  const loss = Math.abs(trades.filter((t) => t.netPnl < 0).reduce((s, t) => s + t.netPnl, 0));
  return { profit: round(profit), loss: round(loss), share: profit + loss > 0 ? profit / (profit + loss) : 0 };
}

const round = (n: number) => Math.round(n * 100) / 100;
