import { BarChart3, CalendarDays, Gauge, Scale, TrendingDown } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { dayResults, drawdownSeries, monthlyReturns, pnlDistribution, profitSplit, summarize, weekColumns, type EquityLite, type TradeLite } from "@/lib/backtest/analytics";

const inr = (n: number, signed = false) => `${n < 0 ? "−" : signed && n > 0 ? "+" : ""}₹${Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const pct = (n: number) => `${n.toFixed(2)}%`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const GREEN = "#1fa955";
const RED = "#e5484d";

/** A two-colour bar: the share that is good against the share that is bad. */
function SplitBar({ good, bad, goodLabel, badLabel }: { good: number; bad: number; goodLabel: string; badLabel: string }) {
  const total = good + bad;
  const g = total > 0 ? (good / total) * 100 : 0;
  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-brand-navy/[0.07]" role="img" aria-label={`${goodLabel}, ${badLabel}`}>
        <span style={{ width: `${g}%`, background: GREEN }} />
        <span style={{ width: `${total > 0 ? 100 - g : 0}%`, background: RED }} />
      </div>
      <div className="mt-1 flex justify-between text-[11px]">
        <span className="font-semibold text-[#0b6b30]">{goodLabel}</span>
        <span className="font-semibold text-brand-sell">{badLabel}</span>
      </div>
    </div>
  );
}

/** The last trades as dots in order — a run of wins or losses shows as a run of colour. A bigger dot is a bigger result. */
function TradeStrip({ trades }: { trades: TradeLite[] }) {
  const last = [...trades].sort((a, b) => a.exitTime - b.exitTime).slice(-48);
  if (!last.length) return <p className="text-xs text-brand-navy/45">No trades yet.</p>;
  const biggest = Math.max(...last.map((t) => Math.abs(t.netPnl)), 1);
  return (
    <div className="flex flex-wrap items-center gap-[5px]" role="img" aria-label="The most recent trades in order, green for a win and red for a loss">
      {last.map((t, i) => {
        const size = 7 + (Math.abs(t.netPnl) / biggest) * 9;
        return <span key={i} title={inr(t.netPnl, true)} className="rounded-full" style={{ width: size, height: size, background: t.netPnl >= 0 ? GREEN : RED, opacity: 0.85 }} />;
      })}
    </div>
  );
}

/** Every trading week as a column, Monday at the top to Friday at the bottom: a quick read of when it earned and when it gave back. */
function WeekGrid({ trades }: { trades: TradeLite[] }) {
  const weeks = weekColumns(dayResults(trades));
  if (!weeks.length) return <p className="py-6 text-sm text-brand-navy/50">No closed trades to show.</p>;
  const biggest = Math.max(...weeks.flatMap((w) => w.days.map((d) => Math.abs(d ?? 0))), 1);
  const shade = (v: number) => 0.28 + 0.72 * Math.min(1, Math.abs(v) / biggest);
  return (
    <div className="overflow-x-auto pb-2">
      <div className="inline-flex gap-2">
        <div className="flex flex-col justify-end gap-[3px] pb-[2px] pt-[18px] text-[9px] text-brand-navy/40">
          {["Mon", "Tue", "Wed", "Thu", "Fri"].map((d) => (
            <span key={d} className="flex h-4 items-center">{d}</span>
          ))}
        </div>
        <div className="flex gap-[3px]">
          {weeks.map((w) => (
            <div key={w.monday} className="flex flex-col gap-[3px]">
              <span className="h-[15px] whitespace-nowrap text-[9px] font-medium leading-[15px] text-brand-navy/50">{w.month ?? ""}</span>
              {w.days.map((v, i) => (
                <span
                  key={i}
                  title={v === null ? `${w.monday} +${i}d: no trade` : `Week of ${w.monday}, day ${i + 1}: ${inr(v, true)}`}
                  className="h-4 w-4 rounded-[5px]"
                  style={v === null ? { background: "rgba(14,27,45,0.06)" } : { background: v >= 0 ? GREEN : RED, opacity: shade(v) }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <p className="mt-2 flex items-center gap-2 text-[10px] text-brand-navy/45">
        <span className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: RED }} /> loss
        <span className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: GREEN }} /> profit
        <span className="inline-block h-2.5 w-2.5 rounded-[3px] bg-brand-navy/[0.06]" /> no trade · stronger colour = bigger day
      </p>
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

/** The results at a glance, week by week, month by month, the fall from the peak and how trade results are spread. */
export default function BacktestAnalytics({ trades, equity }: { trades: TradeLite[]; equity: EquityLite[] }) {
  const s = summarize(trades, equity);
  const split = profitSplit(trades);
  const net = Math.round((split.profit - split.loss) * 100) / 100;
  const factor = split.loss > 0 ? split.profit / split.loss : null;
  const share = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : "—");
  return (
    <div className="mt-6 space-y-6">
      <Card className="p-5">
        <CardHeader title="Results at a glance" subtitle={`${s.totalTrades} trade${s.totalTrades === 1 ? "" : "s"} over ${s.tradingDays} trading day${s.tradingDays === 1 ? "" : "s"}`} icon={Scale} />
        <div className="mt-5 grid gap-6 lg:grid-cols-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-navy/45">What it earned</p>
            <p className={`num mt-1 text-3xl font-bold tabular-nums ${net >= 0 ? "text-[#0b6b30]" : "text-brand-sell"}`}>{inr(net, true)}</p>
            <div className="mt-3">
              <SplitBar good={split.profit} bad={split.loss} goodLabel={`Won ${inr(split.profit)}`} badLabel={`Lost ${inr(split.loss)}`} />
            </div>
            <p className="mt-2 text-xs text-brand-navy/55">{factor === null ? (split.profit > 0 ? "No losing trades." : "") : `Every ₹1 lost was matched by ₹${factor.toFixed(2)} won.`}</p>
          </div>
          <div className="space-y-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-navy/45">How often it wins</p>
            <div>
              <p className="mb-1 text-xs text-brand-navy/60">Days · {share(s.winDays, s.tradingDays)} were profitable</p>
              <SplitBar good={s.winDays} bad={s.lossDays} goodLabel={`${s.winDays} up`} badLabel={`${s.lossDays} down`} />
            </div>
            <div>
              <p className="mb-1 text-xs text-brand-navy/60">Trades · {share(s.winTrades, s.totalTrades)} were winners</p>
              <SplitBar good={s.winTrades} bad={s.lossTrades} goodLabel={`${s.winTrades} won`} badLabel={`${s.lossTrades} lost`} />
            </div>
            <p className="text-xs text-brand-navy/55">
              Average win {inr(s.avgWin, true)} · average loss {inr(s.avgLoss, true)}
            </p>
          </div>
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-navy/45">Runs and extremes</p>
            <TradeStrip trades={trades} />
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <div>
                <dt className="text-brand-navy/50">Longest winning run</dt>
                <dd className="num font-semibold text-[#0b6b30]">{s.longestWinStreak} day{s.longestWinStreak === 1 ? "" : "s"}</dd>
              </div>
              <div>
                <dt className="text-brand-navy/50">Longest losing run</dt>
                <dd className="num font-semibold text-brand-sell">{s.longestLossStreak} day{s.longestLossStreak === 1 ? "" : "s"}</dd>
              </div>
              <div>
                <dt className="text-brand-navy/50">Best day · best trade</dt>
                <dd className="num font-semibold text-brand-navy">{inr(s.bestDay, true)} · {inr(s.bestTrade, true)}</dd>
              </div>
              <div>
                <dt className="text-brand-navy/50">Worst day · worst trade</dt>
                <dd className="num font-semibold text-brand-navy">{inr(s.worstDay, true)} · {inr(s.worstTrade, true)}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-brand-navy/50">Deepest fall from a peak</dt>
                <dd className="num font-semibold text-brand-sell">{pct(s.maxDrawdownPct)} <span className="font-normal text-brand-navy/50">({inr(s.maxDrawdown)})</span></dd>
              </div>
            </dl>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <CardHeader title="Week by week" subtitle="One column per trading week, Monday at the top — green where it made money, red where it lost" icon={CalendarDays} />
        <div className="mt-4">
          <WeekGrid trades={trades} />
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
