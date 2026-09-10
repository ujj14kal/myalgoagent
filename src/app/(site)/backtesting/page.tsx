import type { Metadata } from "next";
import LegalPage, { type LegalSection } from "@/components/legal-page";
import { Callout } from "@/components/section";
import { breadcrumbJsonLd, siteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Backtesting Engine",
  description:
    "Realistic strategy backtesting with configurable fees, brokerage and slippage, look-ahead bias prevention, and a full set of performance metrics.",
  alternates: { canonical: `${siteUrl}/backtesting` },
};

const sections: LegalSection[] = [
  {
    id: "configurable",
    title: "What's configurable",
    bullets: [
      "Instrument(s), strategy, timeframe and historical period",
      "Starting capital and position-sizing rules",
      "Brokerage, transaction fees, taxes/levies where applicable",
      "A slippage model and spread assumptions",
      "Margin/leverage rules where applicable",
    ],
  },
  {
    id: "why",
    title: "Why it matters",
    paragraphs: [
      "A backtest that ignores fees, slippage and realistic fills will overstate performance. MyAlgoAgent's backtesting engine applies the same cost assumptions a live strategy would face, so results are a more honest estimate of what actually happened.",
    ],
  },
  {
    id: "bias",
    title: "Bias prevention",
    bullets: [
      "No look-ahead bias — a strategy can only act on data available at that point in time",
      "No future-data leakage into indicator calculations",
      "Correct handling of indicator warm-up periods",
      "Trading-session and calendar awareness",
      "Explicit handling of missing or invalid market data",
    ],
  },
  {
    id: "metrics",
    title: "Metrics reported",
    bullets: [
      "Total return, absolute P&L, CAGR where meaningful",
      "Win rate, loss rate, profit factor, expectancy",
      "Maximum drawdown, average drawdown, recovery factor",
      "Sharpe, Sortino and Calmar ratios, volatility",
      "Trade count, average holding period, largest win/loss",
      "Monthly/yearly returns and performance by instrument",
    ],
  },
  {
    id: "reproducibility",
    title: "Reproducibility",
    paragraphs: [
      "Every backtest stores its exact configuration alongside its results, so results can be reproduced and audited later — an important property when a strategy graduates to paper or live trading.",
    ],
  },
  {
    id: "disclosure",
    title: "Important disclosure",
    body: (
      <Callout tone="gold">
        A backtest describes how a strategy would have performed on
        historical data under the modeled assumptions. It is not a
        guarantee of future performance. Markets change, and live
        execution can differ from simulated fills.
      </Callout>
    ),
  },
];

export default function BacktestingPage() {
  const jsonLd = breadcrumbJsonLd([
    { name: "Home", url: siteUrl },
    { name: "Backtesting", url: `${siteUrl}/backtesting` },
  ]);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <LegalPage
        label="Product / Backtesting"
        title="Realistic backtesting, not just raw price math"
        updated="September 2026"
        intro="Backtests are built to reflect what a strategy would actually have cost and earned — not an idealized, frictionless simulation."
        sections={sections}
        breadcrumbLabel="Backtesting"
        breadcrumbHref="/backtesting"
      />
    </>
  );
}
