import type { Metadata } from "next";
import { Activity, Bell, FlaskConical, Layers, Radio, ShieldCheck, Sparkles } from "lucide-react";
import PageHeader from "@/components/page-header";
import { Breadcrumbs } from "@/components/section";
import { breadcrumbJsonLd, siteUrl, pageMetadata } from "@/lib/site";
import Reveal from "@/components/reveal";
import ComingSoonTag, { ComingSoonList } from "@/components/coming-soon-tag";

export const metadata: Metadata = pageMetadata({
  title: "Features",
  description:
    "Strategy builder, technical indicators, realistic backtesting, paper trading, risk controls and portfolio tracking — with live broker execution coming soon.",
  path: "/features",
});

type Group = {
  title: string;
  icon: typeof Layers;
  items: string[];
  /** Planned, not built yet — shown under a "Coming soon" tag. */
  soon?: string[];
  comingSoon?: boolean;
};

const groups: Group[] = [
  {
    title: "Strategy Builder",
    icon: Layers,
    items: [
      "No-code visual builder with AND/OR condition groups — or write the same rules as code",
      "Entry and exit conditions, long and short support where the market allows it",
      "Indicator-to-indicator and price-to-indicator comparisons, crossovers and crossunders",
      "Stop-loss, take-profit and trailing-stop rules",
      "Position sizing by fixed quantity, fixed capital or percentage of capital",
      "Human-readable strategy summaries",
    ],
    soon: ["Risk-per-trade position sizing", "Cooldown periods and maximum trade limits"],
  },
  {
    title: "Technical Indicators",
    icon: Activity,
    items: [
      "Moving averages: SMA, EMA, WMA",
      "RSI, MACD, Bollinger Bands, ATR",
      "VWAP, ADX/DMI, Stochastic Oscillator, CCI",
      "ROC/Momentum, OBV and other volume-based indicators",
      "Donchian channels and pivot points",
    ],
    soon: ["Automatic support and resistance levels"],
  },
  {
    title: "Backtesting & Analytics",
    icon: FlaskConical,
    items: [
      "Configurable date range, timeframe, starting capital, brokerage and slippage",
      "Total return, CAGR, win rate, profit factor, max drawdown, Sharpe ratio, expectancy",
      "Trade-by-trade history with chart markers for entries and exits",
      "Equity curve for every run",
    ],
    soon: ["Sortino ratio", "Drawdown curve and benchmark comparison"],
  },
  {
    title: "Paper & Live Trading",
    icon: Radio,
    items: ["Paper trading with virtual capital and simulated fills on end-of-day data"],
    soon: [
      "Live trading via supported broker APIs, with explicit user authorization",
      "Order lifecycle tracking: pending, submitted, filled, rejected, cancelled",
      "Position and P&L reconciliation with the connected broker",
    ],
  },
  {
    title: "Risk Management",
    icon: ShieldCheck,
    items: [
      "Maximum loss per session and maximum consecutive losses",
      "Global emergency kill switch, plus pause or stop for any single session",
    ],
    soon: [
      "Maximum daily loss, position size and portfolio exposure limits",
      "Per-strategy capital allocation and maximum trades per day",
      "Broker-disconnect and stale-data safety behavior",
    ],
  },
  {
    title: "Monitoring & Reporting",
    icon: Bell,
    items: [
      "Alerts for signals, fills, stopped sessions and risk-limit breaches",
      "Portfolio, order and position dashboards",
    ],
    soon: ["Audit logs for authentication, strategy and trading actions", "CSV export of trades and backtest results"],
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
      <PageHeader eyebrow="Features" title="What you can use today — and what’s next" description="Strategy creation, testing and risk control you can use now, with planned features clearly marked as coming soon." />
      <Reveal>
        <div className="mx-auto grid max-w-5xl gap-6 px-4 py-14 sm:grid-cols-2">
          {groups.map((g) => (
            <div key={g.title} className="surface surface-interactive p-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-primary/[0.08] text-brand-primary">
                <g.icon size={19} />
              </span>
              <div className="mt-4 flex items-center gap-2.5">
                <h2 className="text-lg font-semibold text-brand-navy">{g.title}</h2>
                {g.comingSoon && <ComingSoonTag />}
              </div>
              <ul className="mt-3 space-y-2 text-sm leading-relaxed text-brand-navy/70">
                {g.items.map((i2) => (
                  <li key={i2} className="flex gap-2">
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-brand-primary/50" />
                    <span>{i2}</span>
                  </li>
                ))}
              </ul>
              {g.soon && <ComingSoonList items={g.soon} />}
            </div>
          ))}
        </div>
      </Reveal>
    </>
  );
}
