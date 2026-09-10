import type { Metadata } from "next";
import Link from "next/link";
import LegalPage, { type LegalSection } from "@/components/legal-page";
import { breadcrumbJsonLd, siteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Technology & AWS Infrastructure",
  description:
    "The technology stack behind MyAlgoAgent and the AWS architecture used to run it: compute, database, storage, APIs, monitoring and cost-conscious design.",
  alternates: { canonical: `${siteUrl}/technology` },
};

const sections: LegalSection[] = [
  {
    id: "stack",
    title: "Technology stack",
    paragraphs: ["The public site and application are built on:"],
    bullets: [
      "Next.js (React, TypeScript) — server-rendered frontend and marketing site, chosen for SSR/SSG so pages are crawlable and fast.",
      "PostgreSQL — relational storage for users, strategies, orders, trades and portfolio state, via Prisma ORM.",
      "Tailwind CSS — design system implementation for a consistent, accessible UI.",
      "lightweight-charts — TradingView's own open-source charting library, for price and indicator charts.",
    ],
    extra: (
      <p className="mt-4 text-sm leading-relaxed text-brand-navy/70">
        This list reflects the stack actually used to build the platform; it will be updated as the implementation evolves.
      </p>
    ),
  },
  {
    id: "why-cloud",
    title: "Why cloud infrastructure is needed",
    paragraphs: [
      "An algo-trading platform has workloads that a static site does not: persistent backend services, a database of user strategies and trade history, scheduled and event-driven jobs (market-data ingestion, strategy evaluation, backtest execution), authenticated APIs, and monitoring for a system where downtime or a stale risk check has real financial consequences for users.",
    ],
  },
  {
    id: "architecture",
    title: "AWS architecture",
    paragraphs: ["The production architecture, running entirely on AWS:"],
    bullets: [
      "Compute: AWS Amplify Hosting (Lambda-based), so capacity scales with load instead of running always-on idle servers.",
      "Database: Amazon RDS for PostgreSQL for durable, transactional storage of accounts, strategies, orders and audit logs.",
      "Storage: Amazon S3 for user uploads and static assets.",
      "Rate limiting: Amazon DynamoDB for cross-instance request throttling.",
      "Email: Amazon SES for transactional account and security email.",
      "Networking / edge: Amazon CloudFront and Route 53 for HTTPS delivery, DNS and a single canonical domain.",
      "Monitoring: Amazon CloudWatch for logs, metrics, alarms and health checks on trading-critical services.",
      "CI/CD: automatic build-and-deploy on every push to the main branch, via Amplify Hosting's built-in pipeline.",
    ],
  },
  {
    id: "cost",
    title: "Expected workloads & cost drivers",
    paragraphs: [
      "The primary cost drivers are expected to be: compute for the backend/trading-engine services, the managed database, market-data API costs (paid to third-party data providers, not AWS), and outbound data transfer. The architecture favors managed, pay-for-what-you-use services over always-on, oversized infrastructure.",
    ],
  },
  {
    id: "security",
    title: "Security posture",
    body: (
      <p className="mt-3 text-sm leading-relaxed text-brand-navy/70">
        HTTPS/TLS everywhere, secrets never stored in source control or
        exposed to browser code, server-side authorization checks on every
        trading action, and audit logging for authentication and trading
        events. See the full <Link href="/security" className="text-brand-primary underline">Security</Link> page.
      </p>
    ),
  },
  {
    id: "note",
    title: "Important note",
    paragraphs: [
      "MyAlgoAgent is not endorsed, sponsored, certified or partnered with Amazon or AWS. AWS is used as third-party cloud infrastructure, the same way any software company uses a cloud provider.",
    ],
  },
];

export default function TechnologyPage() {
  const jsonLd = breadcrumbJsonLd([
    { name: "Home", url: siteUrl },
    { name: "Technology & AWS Infrastructure", url: `${siteUrl}/technology` },
  ]);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <LegalPage
        label="Product / Technology"
        title="Technology & Cloud Infrastructure"
        updated="September 2026"
        intro="What the platform is built with, and why it needs cloud infrastructure to run reliably."
        sections={sections}
        breadcrumbLabel="Technology & AWS"
        breadcrumbHref="/technology"
      />
    </>
  );
}
