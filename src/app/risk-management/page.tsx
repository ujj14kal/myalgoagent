import type { Metadata } from "next";
import PageHeader from "@/components/page-header";
import { Breadcrumbs, Prose } from "@/components/section";
import { breadcrumbJsonLd, siteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Risk Management",
  description:
    "Server-side risk controls — daily loss limits, position caps, exposure limits and a global kill switch — that operate independently of the user interface.",
  alternates: { canonical: `${siteUrl}/risk-management` },
};

const limits = [
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
];

export default function RiskManagementPage() {
  const jsonLd = breadcrumbJsonLd([
    { name: "Home", url: siteUrl },
    { name: "Risk Management", url: `${siteUrl}/risk-management` },
  ]);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Breadcrumbs items={[{ href: "/", label: "Home" }, { href: "/risk-management", label: "Risk Management" }]} />
      <PageHeader eyebrow="Risk Management" title="Risk controls that don't depend on the interface" description="Every limit below is designed to be enforced on the backend, so a strategy can be stopped safely even if the user isn't watching." />
      <Prose>
        <h2>Configurable limits</h2>
        <ul>
          {limits.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>

        <h2>Kill switches</h2>
        <p>
          A global kill switch stops every active strategy across a user&rsquo;s
          account immediately. A strategy-level kill switch stops a single
          strategy without affecting others. Both are reachable from the
          dashboard at all times when live or paper strategies are running.
        </p>

        <h2>Failure handling</h2>
        <ul>
          <li>Broker-disconnect safety behavior — no new orders are placed while disconnected</li>
          <li>Stale market-data detection, so a strategy doesn&rsquo;t act on outdated prices</li>
          <li>Time-based and instrument-level trading restrictions where configured</li>
        </ul>

        <h2>Auditability</h2>
        <p>
          Every risk-limit breach and every kill-switch activation is logged
          to an audit trail, along with the account and trading actions that
          triggered it, so behavior can be reviewed after the fact.
        </p>
      </Prose>
    </>
  );
}
