import type { Metadata } from "next";
import PageHeader from "@/components/page-header";
import { Breadcrumbs, Prose } from "@/components/section";
import { breadcrumbJsonLd, siteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Technology & AWS Infrastructure",
  description:
    "The technology stack behind MyAlgoAgent and the AWS architecture used to run it: compute, database, storage, APIs, monitoring and cost-conscious design.",
  alternates: { canonical: `${siteUrl}/technology` },
};

export default function TechnologyPage() {
  const jsonLd = breadcrumbJsonLd([
    { name: "Home", url: siteUrl },
    { name: "Technology & AWS Infrastructure", url: `${siteUrl}/technology` },
  ]);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Breadcrumbs items={[{ href: "/", label: "Home" }, { href: "/technology", label: "Technology & AWS" }]} />
      <PageHeader
        eyebrow="Technology"
        title="Technology & Cloud Infrastructure"
        description="What the platform is built with, and why it needs cloud infrastructure to run reliably."
      />
      <Prose>
        <h2>Technology stack</h2>
        <p>The public site and application are built on:</p>
        <ul>
          <li><strong>Next.js (React, TypeScript)</strong> — server-rendered frontend and marketing site, chosen for SSR/SSG so pages are crawlable and fast.</li>
          <li><strong>Node.js / TypeScript services</strong> — application and trading-engine backend logic.</li>
          <li><strong>PostgreSQL</strong> — relational storage for users, strategies, orders, trades and portfolio state.</li>
          <li><strong>Redis</strong> — caching and background job/queue coordination for time-sensitive tasks like signal evaluation.</li>
          <li><strong>Tailwind CSS</strong> — design system implementation for a consistent, accessible UI.</li>
        </ul>
        <p>This list reflects the stack actually used to build the platform; it will be updated as the implementation evolves.</p>

        <h2>Why cloud infrastructure is needed</h2>
        <p>
          An algo-trading platform has workloads that a static site does not:
          persistent backend services, a database of user strategies and
          trade history, scheduled and event-driven jobs (market-data
          ingestion, strategy evaluation, backtest execution), authenticated
          APIs, and monitoring for a system where downtime or a stale
          risk check has real financial consequences for users.
        </p>

        <h2>Planned AWS architecture</h2>
        <p>
          The target production architecture, sized for a startup operating
          under a promotional AWS credit budget:
        </p>
        <ul>
          <li><strong>Compute:</strong> containerized services on ECS Fargate (or a comparably managed compute service), so capacity scales with load instead of running always-on idle servers.</li>
          <li><strong>Database:</strong> Amazon RDS for PostgreSQL for durable, transactional storage of accounts, strategies, orders and audit logs.</li>
          <li><strong>Caching / queues:</strong> Amazon ElastiCache (Redis) for low-latency state and background job coordination.</li>
          <li><strong>Storage:</strong> Amazon S3 for static assets, exported reports and backtest artifacts.</li>
          <li><strong>Secrets:</strong> AWS Secrets Manager for broker API credentials and other sensitive configuration — never committed to source control.</li>
          <li><strong>Networking / edge:</strong> Amazon CloudFront and Route 53 for HTTPS delivery, DNS and a single canonical domain.</li>
          <li><strong>Monitoring:</strong> Amazon CloudWatch for logs, metrics, alarms and health checks on trading-critical services.</li>
          <li><strong>CI/CD:</strong> a standard container build-and-deploy pipeline with separate development, staging and production environments.</li>
        </ul>

        <h2>Environments</h2>
        <p>
          Configuration is environment-based (development, staging,
          production) so the same application code can move between them
          without code changes — only environment variables and secrets
          differ.
        </p>

        <h2>Expected workloads & cost drivers</h2>
        <p>
          The primary cost drivers are expected to be: compute for the
          backend/trading-engine services, the managed database, market-data
          API costs (paid to third-party data providers, not AWS), and
          outbound data transfer. The architecture favors managed,
          pay-for-what-you-use services over always-on, oversized
          infrastructure, so a promotional AWS credit budget is used
          responsibly rather than burned on idle capacity.
        </p>

        <h2>Security posture</h2>
        <p>
          HTTPS/TLS everywhere, secrets never stored in source control or
          exposed to browser code, server-side authorization checks on every
          trading action, and audit logging for authentication and trading
          events. See the full <a href="/security">Security</a> page.
        </p>

        <h2>Important note</h2>
        <p>
          MyAlgoAgent is not endorsed, sponsored, certified or partnered
          with Amazon or AWS. AWS is used as third-party cloud
          infrastructure, the same way any software company uses a cloud
          provider.
        </p>
      </Prose>
    </>
  );
}
