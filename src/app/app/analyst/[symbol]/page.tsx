import { notFound } from "next/navigation";
import Link from "next/link";
import { Gauge, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userMarketDataReady } from "@/lib/market-data/for-user";
import { analyze, MIN_CANDLES, type Factor, type Group, type Lean } from "@/lib/analyst/analyze";
import PageHeader from "@/components/ui/page-header";
import SymbolSwitcher from "@/components/symbol-switcher";
import { formatPrice } from "@/lib/format";
import { enforceRateLimit } from "@/lib/rate-limit";

export async function generateMetadata({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  return { title: `Analyst Pro · ${decodeURIComponent(symbol)}`, robots: { index: false } };
}

const GROUPS: Group[] = ["Trend", "Momentum", "Volume", "Volatility"];
const TONE: Record<Lean, string> = { up: "bg-emerald-50 text-emerald-700 border-emerald-200", down: "bg-rose-50 text-rose-700 border-rose-200", neutral: "bg-slate-50 text-slate-600 border-slate-200" };
const LABEL: Record<Lean, string> = { up: "Up", down: "Down", neutral: "Neutral" };
const Icon = ({ lean }: { lean: Lean }) => (lean === "up" ? <TrendingUp size={14} /> : lean === "down" ? <TrendingDown size={14} /> : <Minus size={14} />);

function Row({ f }: { f: Factor }) {
  return (
    <li className="flex items-start gap-3 py-2.5">
      <span className={`mt-0.5 inline-flex w-20 shrink-0 items-center justify-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${TONE[f.lean]}`}>
        <Icon lean={f.lean} /> {LABEL[f.lean]}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-brand-navy">
          {f.name} <span className="font-normal text-brand-navy/40">· weight {f.weight}</span>
        </p>
        <p className="text-sm text-brand-navy/65">{f.reading}</p>
      </div>
    </li>
  );
}

export default async function AnalystSymbolPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol: raw } = await params;
  const symbol = decodeURIComponent(raw);
  const session = await auth();
  if (!session?.user?.id) return null;
  const instrument = await prisma.instrument.findUnique({ where: { symbol } });
  if (!instrument) notFound();

  const instruments = await prisma.instrument.findMany({ orderBy: { symbol: "asc" }, select: { id: true, symbol: true, name: true } });
  let error: string | null = null;
  let result: ReturnType<typeof analyze> = null;
  try {
    await enforceRateLimit(`analyst:${session.user.id}`, 30, 60_000);
    const market = await userMarketDataReady(session.user.id, "view");
    const candles = await market.getHistoricalCandles(symbol, "1y", "1d");
    result = analyze(candles);
    if (!result) error = `This stock has fewer than ${MIN_CANDLES} daily candles, which is too little history to read.`;
  } catch (err) {
    error = err instanceof Error ? err.message : "Could not load market data.";
  }

  return (
    <div>
      <PageHeader title={`Analyst Pro · ${symbol.replace(/\.(NS|BO)$/, "")}`} icon={Gauge} description={`${instrument.name}. A read of the daily chart through standard indicators, each with its weight. It describes the chart as it is today; it is not a forecast or advice.`} />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <SymbolSwitcher currentSymbol={symbol} allInstruments={instruments} basePath="/app/analyst" />
        <Link href={`/app/instruments/${encodeURIComponent(symbol)}`} className="text-sm font-medium text-brand-primary hover:underline">Open the chart</Link>
      </div>

      {error && <p className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}

      {result && (
        <div className="space-y-6">
          <section className="rounded-2xl border border-brand-navy/10 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-navy/50">What the indicators say today</p>
                <p className="mt-1 text-3xl font-bold text-brand-navy">{result.verdict}</p>
                <p className="text-sm text-brand-navy/60">Close {formatPrice(result.close)} · {new Date(result.asOf * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}</p>
              </div>
              {result.atr && <p className="text-sm text-brand-navy/60">Typical daily range: {formatPrice(result.atr.value)} ({result.atr.pct.toFixed(1)}% of the price)</p>}
            </div>
            <div className="mt-4 flex h-3 w-full overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`Up ${result.upPct}%, neutral ${result.neutralPct}%, down ${result.downPct}%`}>
              <div className="bg-emerald-500" style={{ width: `${result.upPct}%` }} />
              <div className="bg-slate-300" style={{ width: `${result.neutralPct}%` }} />
              <div className="bg-rose-500" style={{ width: `${result.downPct}%` }} />
            </div>
            <div className="mt-2 flex justify-between text-sm font-semibold">
              <span className="text-emerald-700">{result.upPct}% lean up</span>
              <span className="text-slate-500">{result.neutralPct}% neutral</span>
              <span className="text-rose-700">{result.downPct}% lean down</span>
            </div>
            <p className="mt-3 text-xs text-brand-navy/50">These percentages are the share of indicator weight leaning each way. They count what the chart shows; they are not the chance that the price will rise or fall.</p>
            {result.warnings.length > 0 && <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-amber-700">{result.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            {GROUPS.map((g) => {
              const rows = result.factors.filter((f) => f.group === g);
              if (!rows.length) return null;
              return (
                <section key={g} className="rounded-2xl border border-brand-navy/10 bg-white p-5 shadow-sm">
                  <h2 className="text-base font-bold text-brand-navy">{g}</h2>
                  <ul className="mt-1 divide-y divide-brand-navy/5">{rows.map((f) => <Row key={f.name} f={f} />)}</ul>
                </section>
              );
            })}
            <section className="rounded-2xl border border-brand-navy/10 bg-white p-5 shadow-sm">
              <h2 className="text-base font-bold text-brand-navy">Nearest levels</h2>
              <p className="text-sm text-brand-navy/60">Recent swing lows below and swing highs above today&apos;s close.</p>
              <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
                {([["Resistance (above)", result.resistance, "text-rose-700"], ["Support (below)", result.support, "text-emerald-700"]] as const).map(([title, levels, tone]) => (
                  <div key={title}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-brand-navy/50">{title}</p>
                    {levels.length === 0 ? <p className="mt-1 text-brand-navy/50">None found</p> : levels.map((l) => <p key={l.price} className={`mt-1 font-semibold ${tone}`}>{formatPrice(l.price)} <span className="font-normal text-brand-navy/50">({l.distancePct > 0 ? "+" : ""}{l.distancePct.toFixed(1)}%)</span></p>)}
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
