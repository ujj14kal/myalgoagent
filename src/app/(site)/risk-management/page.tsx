import type { Metadata } from "next";
import Link from "next/link";
import LegalPage, { type LegalSection } from "@/components/legal-page";
import { Callout } from "@/components/section";
import { breadcrumbJsonLd, siteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Risk Management",
  description:
    "Server-side risk controls — daily loss limits, position caps, exposure limits and a global kill switch — that operate independently of the user interface.",
  alternates: { canonical: `${siteUrl}/risk-management` },
};

const sections: LegalSection[] = [
  {
    id: "limits",
    title: "Configurable limits",
    bullets: [
      "Maximum daily loss",
      "Maximum total drawdown",
      "Maximum position size",
      "Maximum capital allocated to one strategy",
      "Maximum portfolio exposure",
      "Maximum number of open positions",
      "Maximum trades per day",
      "Maximum order value",
      "Maximum consecutive losses",
      "Per-trade risk percentage",
    ],
  },
  {
    id: "kill-switches",
    title: "Kill switches",
    paragraphs: [
      "A global kill switch stops every active strategy across a user's account immediately. A strategy-level kill switch stops a single strategy without affecting others. Both are reachable from the dashboard at all times when live or paper strategies are running.",
    ],
  },
  {
    id: "failure-handling",
    title: "Failure handling",
    bullets: [
      "Broker-disconnect safety behavior — no new orders are placed while disconnected",
      "Stale market-data detection, so a strategy doesn't act on outdated prices",
      "Time-based and instrument-level trading restrictions where configured",
    ],
  },
  {
    id: "auditability",
    title: "Auditability",
    paragraphs: [
      "Every risk-limit breach and every kill-switch activation is logged to an audit trail, along with the account and trading actions that triggered it, so behavior can be reviewed after the fact.",
    ],
  },
  {
    id: "disclosure",
    title: "Important disclosure",
    body: (
      <Callout tone="gold">
        Risk controls reduce, but cannot eliminate, the risk of loss.
        Configuring these limits is your responsibility, and no
        combination of limits guarantees a profitable outcome or full
        protection of capital. See{" "}
        <Link href="/risk-disclosure" className="underline">Risk Disclosure</Link>.
      </Callout>
    ),
  },
];

export default function RiskManagementPage() {
  const jsonLd = breadcrumbJsonLd([
    { name: "Home", url: siteUrl },
    { name: "Risk Management", url: `${siteUrl}/risk-management` },
  ]);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <LegalPage
        label="Product / Risk Management"
        title="Risk controls that don't depend on the interface"
        updated="September 2026"
        intro="Every limit below is designed to be enforced on the backend, so a strategy can be stopped safely even if the user isn't watching."
        sections={sections}
        breadcrumbLabel="Risk Management"
        breadcrumbHref="/risk-management"
      />
    </>
  );
}
