import type { Metadata } from "next";
import PageHeader from "@/components/page-header";
import { Breadcrumbs, Prose } from "@/components/section";
import { breadcrumbJsonLd, siteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Live Algo Trading & Broker Integration",
  description:
    "Live trading through supported broker APIs, protected by explicit user confirmation, server-side risk controls and a global kill switch.",
  alternates: { canonical: `${siteUrl}/live-trading` },
};

export default function LiveTradingPage() {
  const jsonLd = breadcrumbJsonLd([
    { name: "Home", url: siteUrl },
    { name: "Live Trading", url: `${siteUrl}/live-trading` },
  ]);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Breadcrumbs items={[{ href: "/", label: "Home" }, { href: "/live-trading", label: "Live Trading" }]} />
      <PageHeader eyebrow="Live Trading" title="Live execution, protected by explicit confirmation and risk controls" description="Live trading is never enabled implicitly. It requires a connected broker account and explicit user authorization." />
      <Prose>
        <h2>Broker connection</h2>
        <p>
          A user connects a supported broker account through that
          broker&rsquo;s API. The platform tests the connection and
          synchronizes account, position and funds data before marking the
          broker as connected. API credentials are handled through secure
          secret management and are never exposed to browser-side code.
        </p>

        <h2>Before a strategy can trade live</h2>
        <ul>
          <li>An explicit risk acknowledgment from the user</li>
          <li>A tested, active broker connection</li>
          <li>Configured risk limits for that strategy</li>
          <li>Manual start of the strategy — nothing runs automatically without this step</li>
        </ul>

        <h2>Order & state management</h2>
        <ul>
          <li>Order lifecycle tracking: pending, submitted, open, filled, partially filled, rejected, cancelled, failed</li>
          <li>Client-generated order IDs mapped to broker order IDs for traceability</li>
          <li>Duplicate-order prevention and idempotent order processing</li>
          <li>State reconciliation after a connection loss, so positions stay accurate</li>
          <li>A clear LIVE indicator shown throughout the interface whenever real capital is at risk</li>
        </ul>

        <h2>Safety behavior</h2>
        <p>
          If a broker API, market-data feed or internal service becomes
          unavailable, the platform is designed to fail safe — stopping new
          order placement rather than guessing — and to alert the user.
          A global emergency kill switch can halt all live strategies
          immediately.
        </p>

        <h2>Important disclosure</h2>
        <p>
          Live trading risks real capital. my ALGO agent provides the
          software and broker-connectivity architecture; it does not
          custody funds, guarantee execution quality, or provide
          personalized investment advice. See{" "}
          <a href="/risk-disclosure">Risk Disclosure</a>.
        </p>
      </Prose>
    </>
  );
}
