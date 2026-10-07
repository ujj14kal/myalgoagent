import type { Metadata } from "next";
import Link from "next/link";
import LegalPage, { type LegalSection } from "@/components/legal-page";
import { Callout } from "@/components/section";
import { breadcrumbJsonLd, siteUrl, pageMetadata } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "Risk Management",
  description:
    "Server-side risk controls — per-session loss limits, a consecutive-loss limit and a global kill switch — that operate independently of the user interface.",
  path: "/risk-management",
});

const sections: LegalSection[] = [
  {
    id: "limits",
    title: "Configurable limits",
    bullets: [
      "Maximum loss per session, as a percentage of its starting capital",
      "Maximum consecutive losses",
      "Per-strategy stop-loss, take-profit and trailing stop — in %, points or ATR multiples",
      "Build a trading system in three clear layers — blocks, concepts, then the system that decides instrument, capital, sizing, stops, targets and what to do when setups conflict — with every problem listed before you can publish, and published versions that never change under a running trade",
      "Size each trade by the amount you are willing to lose: risk a set percentage of your capital and the shares are worked out from your stop-loss distance",
      "Build a position in stages: a multi-level entry plan buys part on the signal and the rest as price reaches each level or a rule holds, with the stop measured from your average entry and an optional maximum holding period",
      "Take profit in stages: up to three targets, each selling a share of the position and locking profit on the rest — at the target's own price or with a margin to pull back",
      "Per-strategy time rules for intraday: no new entries after a set time, and an automatic square-off so positions are never carried overnight",
    ],
    soon: [
      "Maximum daily loss",
      "Maximum position size",
      "Maximum capital allocated to one strategy",
      "Maximum portfolio exposure",
      "Maximum number of open positions",
      "Maximum trades per day",
      "Maximum order value",
      "Per-trade risk percentage",
    ],
  },
  {
    id: "kill-switches",
    title: "Kill switches",
    paragraphs: [
      "A global kill switch immediately blocks every forward test on your account from opening new positions. Any single session can also be paused or stopped on its own without affecting the others. The kill switch is always one click away on the Risk Controls page.",
    ],
  },
  {
    id: "failure-handling",
    title: "Failure handling",
    comingSoon: true,
    bullets: [
      "Broker-disconnect safety behavior — no new orders are placed while disconnected",
      "Stale market-data detection, so a strategy doesn't act on outdated prices",
      "Instrument-level trading restrictions where configured",
    ],
  },
  {
    id: "auditability",
    title: "Auditability",
    paragraphs: [
      "Every risk-limit breach and every trade blocked by the kill switch is recorded as a risk event and sent to your notifications, so behavior can be reviewed after the fact.",
    ],
    soon: ["A full audit trail of the account and trading actions behind each event"],
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
