import type { Metadata } from "next";
import Link from "next/link";
import LegalPage, { type LegalSection } from "@/components/legal-page";
import { Callout } from "@/components/section";
import { breadcrumbJsonLd, siteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Risk Disclosure",
  description: "Trading and algo-trading risk disclosure for MyAlgoAgent.",
  alternates: { canonical: `${siteUrl}/risk-disclosure` },
};

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
