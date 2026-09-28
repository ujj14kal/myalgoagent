import type { Metadata } from "next";
import Link from "next/link";
import LegalPage, { type LegalSection } from "@/components/legal-page";
import { Callout } from "@/components/section";
import { breadcrumbJsonLd, siteUrl, pageMetadata } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "Risk Disclosure",
  description:
    "Trading and algo-trading risk disclosure for MyAlgoAgent.",
  path: "/risk-disclosure",
});

const sections: LegalSection[] = [
  {
    id: "trading-risk",
    title: "Trading involves risk",
    body: (
      <Callout tone="gold">
        Trading and algorithmic trading involve substantial risk of loss
        and are not suitable for every investor. You could lose some or
        all of your invested capital. Only trade with money you can
        afford to lose.
      </Callout>
    ),
  },
  {
    id: "past-performance",
    title: "Past and backtested performance",
    paragraphs: [
      "Backtested, simulated and historical performance shown on MyAlgoAgent™ does not guarantee future results. Backtests rely on modeled assumptions (fees, slippage, fills) that may differ from actual market conditions. Paper-trading results reflect simulated orders, not real execution.",
    ],
  },
  {
    id: "no-advice",
    title: "No investment advice",
    paragraphs: [
      "MyAlgoAgent provides software tools for building, testing and operating trading strategies. Nothing on this platform constitutes personalized investment advice, a recommendation to buy or sell any security, or a guarantee of profit. AI-generated content is informational only.",
      "Your in-app agent is an AI assistant: it explains the platform and trading concepts and can draft strategy rules for you to review, test and decide on yourself. It does not tell you what to buy or sell, does not predict prices or returns, never acts without your confirmation, and — like any AI — can be wrong. Always review what it drafts before using it.",
    ],
  },
  {
    id: "regulatory",
    title: "Regulatory status",
    body: (
      <Callout tone="gold">
        MyAlgoAgent and Shagoon Softech Pvt. Ltd. are not registered as
        a stock broker, investment advisor, portfolio manager or
        research analyst with SEBI or any other regulator. Live trading
        through a connected broker API is subject to applicable Indian
        securities regulations governing algorithmic trading, and it is
        your responsibility — not MyAlgoAgent&rsquo;s — to ensure your
        use of the platform complies with those regulations and with
        your broker&rsquo;s own terms for API-based trading.
      </Callout>
    ),
  },
  {
    id: "technology-risk",
    title: "Technology risk",
    paragraphs: [
      "Software, network, broker-API and market-data outages can affect strategy execution. While the platform includes risk controls and safe-failure behavior, no system can eliminate technology risk entirely.",
      "Broker connections depend on your broker's API: sessions expire every day, and a broker can change, limit or withdraw its API without notice, which can interrupt a connection until you log in again or reconnect.",
      "Voice input is converted to text by speech recognition, which can mishear words, numbers or stock names. Always check what your agent prepared in the review window before confirming it.",
    ],
  },
  {
    id: "options-risk",
    title: "Options",
    paragraphs: [
      "Options are complex and can lose value quickly; buyers can lose the entire premium paid, and sellers can face losses far larger than the premium received — in some positions, unlimited. The Options Lab is a calculator: its premiums, payoffs and Greeks are model estimates (Black–Scholes) that can differ materially from real market prices, especially near expiry or in fast markets. It does not place or simulate options trades.",
    ],
  },
  {
    id: "demos",
    title: "Demos and illustrations",
    paragraphs: [
      "The strategy builder's demo runs your rules on a short, recent window of data only. Where a replay is labelled an illustration, the price path after the entry is made up to show how your take-profit, stop-loss or trailing stop would behave — it is not a prediction and did not happen. Neither is a substitute for a full backtest, paper trading and your own judgement.",
    ],
  },
  {
    id: "responsibility",
    title: "Your responsibility",
    body: (
      <p className="mt-3 text-sm leading-relaxed text-brand-navy/70">
        You are responsible for the strategies you create or enable, the
        risk limits you configure, and the decision to trade with real
        capital. Review this disclosure and our{" "}
        <Link href="/terms" className="text-brand-primary underline">Terms</Link> before using live trading features.
      </p>
    ),
  },
];

export default function RiskDisclosurePage() {
  const jsonLd = breadcrumbJsonLd([
    { name: "Home", url: siteUrl },
    { name: "Risk Disclosure", url: `${siteUrl}/risk-disclosure` },
  ]);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <LegalPage
        label="Legal / Risk"
        title="Risk Disclosure"
        updated="September 2026"
        intro="What you should understand about risk before creating a strategy, backtesting it, or connecting real capital."
        sections={sections}
        breadcrumbLabel="Risk Disclosure"
        breadcrumbHref="/risk-disclosure"
      />
    </>
  );
}
