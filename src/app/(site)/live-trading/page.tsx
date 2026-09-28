import type { Metadata } from "next";
import Link from "next/link";
import LegalPage, { type LegalSection } from "@/components/legal-page";
import { Callout } from "@/components/section";
import { breadcrumbJsonLd, siteUrl, pageMetadata } from "@/lib/site";
import BrokerLogos from "@/components/broker-logos";

export const metadata: Metadata = pageMetadata({
  title: "Live Algo Trading & Broker Integration",
  description:
    "Connect your own account at 9 Indian brokers today. Live order placement is coming soon — protected by explicit user confirmation, server-side risk controls and a global kill switch.",
  path: "/live-trading",
});

const sections: LegalSection[] = [
  {
    id: "status",
    title: "Availability",
    paragraphs: [
      "Broker connections are live: you can link your own account at Dhan, Zerodha, Upstox, Fyers, Angel One, Groww, ICICI Direct, 5paisa or Alice Blue today. Placing live orders through that connection is not available yet — until then you build strategies, backtest them and run them in forward testing with notional capital. The sections marked coming soon describe how live order placement will work when it launches.",
    ],
  },
  {
    id: "brokers",
    title: "Broker connection",
    paragraphs: [
      "You create a free API app on your broker's developer site, paste the Redirect URL we give you, paste your API key and secret on the Broker Connections page, and log in on your broker's own page — your password, PIN and 2FA are never entered on MyAlgoAgent. (Groww works slightly differently: you approve your key on Groww each day — or choose automatic login with Groww's API TOTP key — instead of logging in through a redirect. With Upstox you can also approve with a tap on your phone.) The platform verifies the connection with your broker before marking it connected.",
      "Your API key, secret and each day's session token are encrypted with AES-256 before they're stored and are never sent to the browser. Broker sessions end every day by exchange rules, so you log in once each trading day. Placing live orders will also need a static IP registered on your broker account (a SEBI rule) — we'll guide you through that when order placement launches.",
    ],
    extra: (
      <div className="mt-5">
        <BrokerLogos variant="strip" />
      </div>
    ),
  },
  {
    id: "before-live",
    title: "Before a strategy can trade live",
    comingSoon: true,
    bullets: [
      "An explicit risk acknowledgment from the user",
      "A tested, active broker connection (available today)",
      "Configured risk limits for that strategy",
      "Manual start of the strategy — nothing runs automatically without this step",
    ],
  },
  {
    id: "orders",
    title: "Order & state management",
    comingSoon: true,
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
    comingSoon: true,
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
        intro="Connect your broker today; live trading is never enabled implicitly — it will require a connected broker account and explicit user authorization."
        sections={sections}
        breadcrumbLabel="Live Trading"
        breadcrumbHref="/live-trading"
      />
    </>
  );
}
