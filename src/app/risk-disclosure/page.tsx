import type { Metadata } from "next";
import PageHeader from "@/components/page-header";
import { Breadcrumbs, Prose } from "@/components/section";
import { breadcrumbJsonLd, siteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Risk Disclosure",
  description: "Trading and algo-trading risk disclosure for MyAlgoAgent.",
  alternates: { canonical: `${siteUrl}/risk-disclosure` },
};

export default function RiskDisclosurePage() {
  const jsonLd = breadcrumbJsonLd([
    { name: "Home", url: siteUrl },
    { name: "Risk Disclosure", url: `${siteUrl}/risk-disclosure` },
  ]);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Breadcrumbs items={[{ href: "/", label: "Home" }, { href: "/risk-disclosure", label: "Risk Disclosure" }]} />
      <PageHeader eyebrow="Legal" title="Risk Disclosure" description="Last updated: draft — pending legal review." />
      <Prose>
        <h2>Trading involves risk</h2>
        <p>
          Trading and algorithmic trading involve substantial risk of loss
          and are not suitable for every investor. You could lose some or
          all of your invested capital. Only trade with money you can
          afford to lose.
        </p>

        <h2>Past and backtested performance</h2>
        <p>
          Backtested, simulated and historical performance shown on
          MyAlgoAgent&trade; does not guarantee future results. Backtests rely on
          modeled assumptions (fees, slippage, fills) that may differ from
          actual market conditions. Paper-trading results reflect simulated
          orders, not real execution.
        </p>

        <h2>No investment advice</h2>
        <p>
          MyAlgoAgent provides software tools for building, testing and
          operating trading strategies. Nothing on this platform constitutes
          personalized investment advice, a recommendation to buy or sell
          any security, or a guarantee of profit. AI-generated content is
          informational only.
        </p>

        <h2>Technology risk</h2>
        <p>
          Software, network, broker-API and market-data outages can affect
          strategy execution. While the platform includes risk controls and
          safe-failure behavior, no system can eliminate technology risk
          entirely.
        </p>

        <h2>Your responsibility</h2>
        <p>
          You are responsible for the strategies you create or enable, the
          risk limits you configure, and the decision to trade with real
          capital. Review this disclosure and our{" "}
          <a href="/terms">Terms</a> before using live trading features.
        </p>

        <p className="text-sm text-brand-navy/50">
          This page is a template and must be reviewed by qualified legal
          counsel for your jurisdiction and business model before public
          launch.
        </p>
      </Prose>
    </>
  );
}
