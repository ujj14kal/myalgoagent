import type { Metadata } from "next";
import { Activity, Bell, FlaskConical, Layers, Radio, ShieldCheck, Sparkles } from "lucide-react";
import PageHeader from "@/components/page-header";
import { Breadcrumbs } from "@/components/section";
import { breadcrumbJsonLd, siteUrl, pageMetadata } from "@/lib/site";
import Reveal from "@/components/reveal";

export const metadata: Metadata = pageMetadata({
  title: "Features",
  description:
    "Strategy builder, technical indicators, realistic backtesting, paper trading, live broker execution, risk controls and portfolio tracking.",
  path: "/features",
});

const groups = [
  {
    title: "Strategy Builder",
    icon: Layers,
    items: [
      "No-code visual builder with AND/OR condition groups",
      "Entry and exit conditions, long and short support where the market allows it",
      "Indicator-to-indicator and price-to-indicator comparisons, crossovers and crossunders",
      "Stop-loss, take-profit and trailing-stop rules",
      "Position sizing by fixed quantity, fixed capital, percentage of capital or risk per trade",
      "Cooldown periods, maximum trade limits and human-readable strategy summaries",
    ],
  },
  {
    title: "Technical Indicators",
    icon: Activity,
    items: [
      "Moving averages: SMA, EMA, WMA",
      "RSI, MACD, Bollinger Bands, ATR",
      "VWAP, ADX/DMI, Stochastic Oscillator, CCI",
      "ROC/Momentum, OBV and other volume-based indicators",
      "Support/resistance, Donchian channels and pivot points",
    ],
  },
  {
    title: "Backtesting & Analytics",
    icon: FlaskConical,
    items: [
      "Configurable date range, timeframe, starting capital, brokerage, fees and slippage",
      "Total return, CAGR, win rate, profit factor, max drawdown, Sharpe/Sortino, expectancy",
      "Trade-by-trade history with chart markers for entries and exits",
      "Equity curve, drawdown curve and benchmark comparison",
    ],
  },
  {
    title: "Paper & Live Trading",
    icon: Radio,
    items: [
      "Paper trading with virtual capital and simulated fills",
      "Live trading via supported broker APIs, with explicit user authorization",
      "Order lifecycle tracking: pending, submitted, filled, rejected, cancelled",
      "Position and P&L reconciliation with the connected broker",
    ],
  },
  {
    title: "Risk Management",
    icon: ShieldCheck,
    items: [
      "Maximum daily loss, position size and portfolio exposure limits",
      "Per-strategy capital allocation and maximum trades per day",
      "Global emergency kill switch and strategy-level kill switch",
      "Broker-disconnect and stale-data safety behavior",
    ],
  },
  {
    title: "Monitoring & Reporting",
    icon: Bell,
    items: [
      "Alerts for signals, fills, rejections and risk-limit breaches",
      "Portfolio, order and position dashboards",
      "Audit logs for authentication, strategy and trading actions",
      "CSV export of trades and backtest results",
    ],
  },
  {
    title: "AI Strategy Assistant",
    icon: Sparkles,
    comingSoon: true,
    items: [
      "Describe a strategy in plain English and get a built, validated strategy back",
      "Uses the same indicators, conditions and risk rules as the visual builder — nothing exclusive to AI-built strategies",
      "Every AI-generated strategy passes the same feasibility checks as one built by hand",
      "Refine a strategy conversationally instead of re-editing the condition tree by hand",
    ],
  },
];

export default function FeaturesPage() {
  const jsonLd = breadcrumbJsonLd([
    { name: "Home", url: siteUrl },
    { name: "Features", url: `${siteUrl}/features` },
  ]);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Breadcrumbs items={[{ href: "/", label: "Home" }, { href: "/features", label: "Features" }]} />
      <PageHeader eyebrow="Features" title="Everything the platform is built to do" description="A structured feature set covering strategy creation, testing, execution and risk control." />
      <Reveal>
        <div className="mx-auto grid max-w-5xl gap-6 px-4 py-14 sm:grid-cols-2">
          {groups.map((g) => (
            <div key={g.title} className="surface surface-interactive p-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-primary/[0.08] text-brand-primary">
                <g.icon size={19} />
              </span>
              <div className="mt-4 flex items-center gap-2.5">
                <h2 className="text-lg font-semibold text-brand-navy">{g.title}</h2>
                {g.comingSoon && (
                  <span className="rounded-full bg-brand-gold/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#8a7437]">
                    Coming soon
                  </span>
                )}
              </div>
              <ul className="mt-3 space-y-2 text-sm leading-relaxed text-brand-navy/70">
                {g.items.map((i2) => (
                  <li key={i2} className="flex gap-2">
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-brand-primary/50" />
                    <span>{i2}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Reveal>
    </>
  );
}
