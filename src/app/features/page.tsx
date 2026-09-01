import type { Metadata } from "next";
import PageHeader from "@/components/page-header";
import { Breadcrumbs, Prose } from "@/components/section";
import { breadcrumbJsonLd, siteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Features",
  description:
    "Strategy builder, technical indicators, realistic backtesting, paper trading, live broker execution, risk controls and portfolio tracking.",
  alternates: { canonical: `${siteUrl}/features` },
};

const groups = [
  {
    title: "Strategy Builder",
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
    items: [
      "Configurable date range, timeframe, starting capital, brokerage, fees and slippage",
      "Total return, CAGR, win rate, profit factor, max drawdown, Sharpe/Sortino, expectancy",
      "Trade-by-trade history with chart markers for entries and exits",
      "Equity curve, drawdown curve and benchmark comparison",
    ],
  },
  {
    title: "Paper & Live Trading",
    items: [
      "Paper trading with virtual capital and simulated fills",
      "Live trading via supported broker APIs, with explicit user authorization",
      "Order lifecycle tracking: pending, submitted, filled, rejected, cancelled",
      "Position and P&L reconciliation with the connected broker",
    ],
  },
  {
    title: "Risk Management",
    items: [
      "Maximum daily loss, position size and portfolio exposure limits",
      "Per-strategy capital allocation and maximum trades per day",
      "Global emergency kill switch and strategy-level kill switch",
      "Broker-disconnect and stale-data safety behavior",
    ],
  },
  {
    title: "Monitoring & Reporting",
    items: [
      "Alerts for signals, fills, rejections and risk-limit breaches",
      "Portfolio, order and position dashboards",
      "Audit logs for authentication, strategy and trading actions",
      "CSV export of trades and backtest results",
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
      <Prose>
        {groups.map((g) => (
          <div key={g.title}>
            <h2>{g.title}</h2>
            <ul>
              {g.items.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </div>
        ))}
      </Prose>
    </>
  );
}
