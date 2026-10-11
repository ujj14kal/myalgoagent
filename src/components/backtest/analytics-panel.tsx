import { BarChart3, CalendarDays, Gauge, TrendingDown } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { calendarMonths, dayResults, drawdownSeries, monthlyReturns, pnlDistribution, summarize, type EquityLite, type TradeLite } from "@/lib/backtest/analytics";

const inr = (n: number, signed = false) => `${n < 0 ? "−" : signed && n > 0 ? "+" : ""}₹${Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const pct = (n: number) => `${n.toFixed(2)}%`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function Pill({ tone, children }: { tone: "up" | "down"; children: React.ReactNode }) {
  return <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${tone === "up" ? "bg-brand-buy/10 text-[#0b6b30]" : "bg-brand-sell/10 text-brand-sell"}`}>{children}</span>;
}

function Tile({ title, big, children }: { title: string; big: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="surface p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-navy/45">{title}</p>
        <p className="num text-2xl font-bold tabular-nums text-brand-navy">{big}</p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-xs">{children}</div>
    </div>
  );
}

const Part = ({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "up" | "down" }) => (
  <div>
    <p className="text-brand-navy/50">{label}</p>
    <p className={`num mt-0.5 text-sm font-semibold tabular-nums ${tone === "up" ? "text-[#0b6b30]" : tone === "down" ? "text-brand-sell" : "text-brand-navy"}`}>{value}</p>
    {sub && <div className="mt-1">{sub}</div>}
  </div>
);

function DrawdownRing({ pctValue, amount }: { pctValue: number; amount: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const filled = Math.min(1, pctValue / 100) * c;
  return (
    <div className="relative flex h-20 w-20 items-center justify-center" aria-label={`Max drawdown ${pct(pctValue)}`}>
      <svg viewBox="0 0 64 64" className="absolute inset-0 -rotate-90">
        <circle cx={32} cy={32} r={r} fill="none" stroke="#f0f1f5" strokeWidth={6} />
        <circle cx={32} cy={32} r={r} fill="none" stroke="#d93a3a" strokeWidth={6} strokeLinecap="round" strokeDasharray={`${filled} ${c}`} />
      </svg>
      <span className="num text-sm font-bold text-brand-sell">{amount >= 1000 ? `${(amount / 1000).toFixed(2)}K` : amount.toFixed(0)}</span>
    </div>
  );
}

function CalendarHeatmap({ trades }: { trades: TradeLite[] }) {
  const months = calendarMonths(dayResults(trades));
  if (!months.length) return <p className="py-6 text-sm text-brand-navy/50">No closed trades to show.</p>;
  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {months.map((m) => (
        <div key={m.key} className="shrink-0 rounded-xl border border-brand-navy/10 p-2.5">
          <div className="mb-1 grid grid-cols-7 gap-[3px] text-center text-[9px] text-brand-navy/40">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <span key={i}>{d}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-[3px]">
            {m.cells.map((c, i) =>
              c === null ? (
                <span key={i} className="h-3.5 w-3.5" />
              ) : (
                <span
                  key={i}
                  title={c.pnl === null ? `${c.day} ${m.label}: no trade` : `${c.day} ${m.label}: ${inr(c.pnl, true)}`}
                  className={`h-3.5 w-3.5 rounded-[3px] ${c.pnl === null ? "bg-brand-navy/[0.06]" : c.pnl >= 0 ? "bg-[#22b455]" : "bg-[#e5484d]"}`}
                />
              )
            )}
          </div>
          <p className="mt-2 text-center text-[10px] text-brand-navy/55">{m.label}</p>
          <p className={`num text-center text-[11px] font-semibold ${m.pnl >= 0 ? "text-[#0b6b30]" : "text-brand-sell"}`}>{inr(m.pnl, true)}</p>
        </div>
      ))}
    </div>
  );
}

function MonthlyTable({ equity }: { equity: EquityLite[] }) {
  const rows = monthlyReturns(equity);
  if (!rows.length) return <p className="py-6 text-sm text-brand-navy/50">Not enough history for monthly returns.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="data-table text-xs">
        <thead>
          <tr>
            <th>Year</th>
            {MONTHS.map((m) => (
              <th key={m} className="num-cell">
                {m}
              </th>
            ))}
            <th className="num-cell">Year</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.year}>
              <td className="font-semibold">{r.year}</td>
              {r.months.map((v, i) => (
                <td key={i} className={`num-cell ${v === null ? "text-brand-navy/25" : v >= 0 ? "text-[#0b6b30]" : "text-brand-sell"}`} style={v === null ? undefined : { background: `rgba(${v >= 0 ? "34,180,85" : "229,72,77"},${Math.min(0.2, Math.abs(v) / 40)})` }}>
                  {v === null ? "·" : `${v > 0 ? "+" : ""}${v.toFixed(1)}%`}
                </td>
              ))}
              <td className={`num-cell font-semibold ${r.total === null ? "" : r.total >= 0 ? "text-[#0b6b30]" : "text-brand-sell"}`}>{r.total === null ? "·" : `${r.total > 0 ? "+" : ""}${r.total.toFixed(1)}%`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DrawdownChart({ equity }: { equity: EquityLite[] }) {
  const pts = drawdownSeries(equity);
  if (pts.length < 2) return <p className="py-6 text-sm text-brand-navy/50">Not enough history.</p>;
  const w = 600;
  const h = 120;
  const max = Math.max(...pts.map((p) => p.pct), 0.01);
  const t0 = pts[0].time;
  const span = pts[pts.length - 1].time - t0 || 1;
  const x = (t: number) => ((t - t0) / span) * w;
  const y = (v: number) => (v / max) * (h - 8);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${x(p.time).toFixed(1)},${y(p.pct).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-32 w-full" preserveAspectRatio="none" role="img" aria-label="Drawdown over time">
      <line x1={0} x2={w} y1={0} y2={0} stroke="currentColor" strokeOpacity={0.2} />
      <path d={`${d} L${w},0 L0,0 Z`} fill="#e5484d" fillOpacity={0.18} />
      <path d={d} fill="none" stroke="#e5484d" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      <text x={4} y={h - 4} fontSize={10} fill="currentColor" fillOpacity={0.55}>
        deepest {max.toFixed(2)}% below the peak
      </text>
    </svg>
  );
}

function Distribution({ trades }: { trades: TradeLite[] }) {
  const buckets = pnlDistribution(trades, 12);
  if (buckets.length < 2) return <p className="py-6 text-sm text-brand-navy/50">Not enough trades for a spread.</p>;
  const peak = Math.max(...buckets.map((b) => b.count), 1);
  return (
    <div>
      <div className="flex h-28 items-end gap-1">
        {buckets.map((b, i) => (
          <div key={i} className="flex-1" title={`${inr(b.from, true)} to ${inr(b.to, true)}: ${b.count} trade${b.count === 1 ? "" : "s"}`}>
            <div className={`w-full rounded-t ${(b.from + b.to) / 2 >= 0 ? "bg-[#22b455]" : "bg-[#e5484d]"}`} style={{ height: `${(b.count / peak) * 100}%`, minHeight: b.count ? 3 : 0 }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-brand-navy/50">
        <span>{inr(buckets[0].from, true)}</span>
        <span>result per trade</span>
        <span>{inr(buckets[buckets.length - 1].to, true)}</span>
      </div>
    </div>
  );
}

/** Day-by-day and month-by-month views of a backtest: tiles, calendar, monthly returns, drawdown and spread of results. */
export default function BacktestAnalytics({ trades, equity }: { trades: TradeLite[]; equity: EquityLite[] }) {
  const s = summarize(trades, equity);
  const share = (n: number, of: number) => (of ? `${((n / of) * 100).toFixed(1)}%` : "—");
  return (
    <div className="mt-6 space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile title="Trading days" big={s.tradingDays}>
          <Part label="Win days" value={share(s.winDays, s.tradingDays)} tone="up" sub={<Pill tone="up">{s.winDays} of {s.tradingDays}</Pill>} />
          <Part label="Loss days" value={share(s.lossDays, s.tradingDays)} tone="down" sub={<Pill tone="down">{s.lossDays} of {s.tradingDays}</Pill>} />
        </Tile>
        <Tile title="Total trades" big={s.totalTrades}>
          <Part label="Win trades" value={share(s.winTrades, s.totalTrades)} tone="up" sub={<Pill tone="up">{s.winTrades} of {s.totalTrades}</Pill>} />
          <Part label="Loss trades" value={share(s.lossTrades, s.totalTrades)} tone="down" sub={<Pill tone="down">{s.lossTrades} of {s.totalTrades}</Pill>} />
        </Tile>
        <Tile title="Streaks & extremes" big={<span className="text-base">{s.longestWinStreak}W · {s.longestLossStreak}L</span>}>
          <Part label="Best day" value={inr(s.bestDay, true)} tone="up" sub={<span className="text-[10px] text-brand-navy/45">best trade {inr(s.bestTrade, true)}</span>} />
          <Part label="Worst day" value={inr(s.worstDay, true)} tone="down" sub={<span className="text-[10px] text-brand-navy/45">worst trade {inr(s.worstTrade, true)}</span>} />
        </Tile>
        <div className="surface flex items-center justify-between gap-3 p-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-navy/45">Max drawdown</p>
            <p className="num mt-1 text-2xl font-bold text-brand-sell">{pct(s.maxDrawdownPct)}</p>
            <p className="mt-1 text-xs text-brand-navy/50">{inr(s.maxDrawdown)} from peak</p>
            <p className="mt-2 text-[11px] text-brand-navy/45">
              Avg win {inr(s.avgWin, true)} · avg loss {inr(s.avgLoss, true)}
            </p>
          </div>
          <DrawdownRing pctValue={s.maxDrawdownPct} amount={s.maxDrawdown} />
        </div>
      </div>

      <Card className="p-5">
        <CardHeader title="Day-by-day calendar" subtitle="Each square is a trading day: green = profit, red = loss" icon={CalendarDays} />
        <div className="mt-4">
          <CalendarHeatmap trades={trades} />
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <CardHeader title="Monthly returns" subtitle="Change in account value each month" icon={BarChart3} />
          <div className="mt-4">
            <MonthlyTable equity={equity} />
          </div>
        </Card>
        <div className="flex flex-col gap-6">
          <Card className="p-5">
            <CardHeader title="Drawdown" subtitle="How far below its best the account sat" icon={TrendingDown} />
            <div className="mt-3">
              <DrawdownChart equity={equity} />
            </div>
          </Card>
          <Card className="p-5">
            <CardHeader title="Spread of trade results" subtitle="How many trades ended at each profit or loss" icon={Gauge} />
            <div className="mt-3">
              <Distribution trades={trades} />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
