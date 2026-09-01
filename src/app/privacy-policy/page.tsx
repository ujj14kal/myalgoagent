import type { Metadata } from "next";
import PageHeader from "@/components/page-header";
import { Breadcrumbs, Prose } from "@/components/section";
import { breadcrumbJsonLd, siteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How my ALGO agent collects, uses, stores and protects your data.",
  alternates: { canonical: `${siteUrl}/privacy-policy` },
};

export default function PrivacyPolicyPage() {
  const jsonLd = breadcrumbJsonLd([
    { name: "Home", url: siteUrl },
    { name: "Privacy Policy", url: `${siteUrl}/privacy-policy` },
  ]);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Breadcrumbs items={[{ href: "/", label: "Home" }, { href: "/privacy-policy", label: "Privacy Policy" }]} />
      <PageHeader eyebrow="Legal" title="Privacy Policy" description="Last updated: draft — pending legal review." />
      <Prose>
        <h2>What we collect</h2>
        <ul>
          <li>Account information you provide: name, email, authentication data</li>
          <li>Usage data: pages visited, features used, device/browser information</li>
          <li>Trading configuration you create: strategies, backtest settings, risk limits</li>
          <li>Broker connection metadata needed to synchronize orders and positions — never your broker password</li>
        </ul>

        <h2>Why we collect it</h2>
        <ul>
          <li>To provide and operate the platform&rsquo;s features</li>
          <li>To secure your account and detect fraudulent or abusive activity</li>
          <li>To maintain audit logs required for a financial-software product</li>
          <li>To improve reliability and performance</li>
        </ul>

        <h2>How it&rsquo;s stored & protected</h2>
        <p>
          Data is stored in managed database infrastructure with encryption
          in transit (HTTPS/TLS). Sensitive credentials such as broker API
          keys are stored using dedicated secret-management infrastructure,
          separate from general application data.
        </p>

        <h2>Sharing</h2>
        <p>
          We do not sell personal data. Data may be shared with
          infrastructure and service providers (such as our cloud hosting
          provider and market-data providers) strictly as needed to operate
          the platform, and where required by law.
        </p>

        <h2>Retention</h2>
        <p>
          Account and trading records are retained for as long as your
          account is active and as needed to meet audit, security and legal
          obligations, after which they are deleted or anonymized in line
          with applicable law.
        </p>

        <h2>Your rights</h2>
        <p>
          Depending on your jurisdiction, you may have rights to access,
          correct, export or delete your personal data. Contact us at{" "}
          <a href="mailto:privacy@myalgoagent.com">privacy@myalgoagent.com</a>{" "}
          to exercise these rights.
        </p>

        <h2>Cookies</h2>
        <p>
          See our <a href="/cookie-policy">Cookie Policy</a> for details on
          cookies and similar technologies.
        </p>

        <h2>Contact</h2>
        <p>
          Questions about this policy: <a href="/contact">Contact us</a>.
        </p>

        <p className="text-sm text-brand-navy/50">
          This page is a template and must be reviewed by qualified legal
          counsel for your jurisdiction, data practices and business model
          before public launch.
        </p>
      </Prose>
    </>
  );
}
