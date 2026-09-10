import type { Metadata } from "next";
import Link from "next/link";
import LegalPage, { type LegalSection } from "@/components/legal-page";
import { Callout } from "@/components/section";
import { breadcrumbJsonLd, siteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Live Algo Trading & Broker Integration",
  description:
    "Live trading through supported broker APIs, protected by explicit user confirmation, server-side risk controls and a global kill switch.",
  alternates: { canonical: `${siteUrl}/live-trading` },
};

const sections: LegalSection[] = [
  {
    id: "connection",
    title: "Broker connection",
    paragraphs: [
      "A user connects a supported broker account through that broker's API. The platform tests the connection and synchronizes account, position and funds data before marking the broker as connected. API credentials are handled through secure secret management and are never exposed to browser-side code.",
    ],
  },
  {
    id: "before-live",
    title: "Before a strategy can trade live",
    bullets: [
      "An explicit risk acknowledgment from the user",
      "A tested, active broker connection",
      "Configured risk limits for that strategy",
      "Manual start of the strategy — nothing runs automatically without this step",
    ],
  },
  {
    id: "orders",
    title: "Order & state management",
    bullets: [
      "Order lifecycle tracking: pending, submitted, open, filled, partially filled, rejected, cancelled, failed",
      "Client-generated order IDs mapped to broker order IDs for traceability",
      "Duplicate-order prevention and idempotent order processing",
      "State reconciliation after a connection loss, so positions stay accurate",
      "A clear LIVE indicator shown throughout the interface whenever real capital is at risk",
    ],
  },
  {
    id: "safety",
    title: "Safety behavior",
    paragraphs: [
      "If a broker API, market-data feed or internal service becomes unavailable, the platform is designed to fail safe — stopping new order placement rather than guessing — and to alert the user. A global emergency kill switch can halt all live strategies immediately.",
    ],
  },
  {
    id: "disclosure",
    title: "Important disclosure",
    body: (
      <Callout tone="gold">
        Live trading risks real capital. MyAlgoAgent provides the
        software and broker-connectivity architecture; it does not
        custody funds, guarantee execution quality, or provide
        personalized investment advice. Live trading through a broker
        API is also subject to applicable Indian securities regulation,
        and you are responsible for your own regulatory compliance. See{" "}
        <Link href="/risk-disclosure" className="underline">Risk Disclosure</Link>.
      </Callout>
    ),
  },
];

export default function LiveTradingPage() {
  const jsonLd = breadcrumbJsonLd([
    { name: "Home", url: siteUrl },
    { name: "Live Trading", url: `${siteUrl}/live-trading` },
  ]);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <LegalPage
        label="Product / Live Trading"
        title="Live execution, protected by explicit confirmation and risk controls"
        updated="September 2026"
        intro="Live trading is never enabled implicitly. It requires a connected broker account and explicit user authorization."
        sections={sections}
        breadcrumbLabel="Live Trading"
        breadcrumbHref="/live-trading"
      />
    </>
  );
}
