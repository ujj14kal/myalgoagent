import type { Metadata } from "next";
import PageHeader from "@/components/page-header";
import { Breadcrumbs, Prose } from "@/components/section";
import { breadcrumbJsonLd, siteUrl, pageMetadata } from "@/lib/site";
import Reveal from "@/components/reveal";
import ComingSoonTag from "@/components/coming-soon-tag";

export const metadata: Metadata = pageMetadata({
  title: "Security",
  description:
    "How MyAlgoAgent protects credentials, trading data and infrastructure: secret management, encryption, authorization, logging and safe failure states.",
  path: "/security",
});

export default function SecurityPage() {
  const jsonLd = breadcrumbJsonLd([
    { name: "Home", url: siteUrl },
    { name: "Security", url: `${siteUrl}/security` },
  ]);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Breadcrumbs items={[{ href: "/", label: "Home" }, { href: "/security", label: "Security" }]} />
      <PageHeader eyebrow="Security" title="Security practices" description="A financial-software platform handles credentials and account data that need to be protected by default, not as an afterthought." />
      <Reveal>
      <Prose>
        <h2>Credentials & secrets</h2>
        <p>
          Database credentials and other platform secrets are never
          hard-coded or committed to source control. The broker API keys,
          secrets and daily session tokens you connect are encrypted with
          AES-256-GCM before they&rsquo;re stored, bound to your account so
          they can&rsquo;t be moved to another, and decrypted only on our
          servers when talking to your broker &mdash; they are never sent
          to browser-side code. The encryption key is kept apart from the
          database. Your broker password and 2FA are entered only on your
          broker&rsquo;s own login page.
        </p>

        <h2>Encryption</h2>
        <p>
          All traffic is served over HTTPS/TLS. Sensitive data is protected
          at rest using the security controls of the underlying managed
          database and storage services.
        </p>

        <h2>Authentication & authorization</h2>
        <ul>
          <li>Secure password hashing and session/token protection</li>
          <li>Server-side authorization checks on every trading action — never enforced only in the frontend</li>
          <li>Rate limiting and input validation/sanitization on all user input</li>
          <li>Parameterized queries / ORM protections against SQL injection</li>
        </ul>

        <h2>Monitoring & logging</h2>
        <p>
          Every risk-limit breach and kill-switch block is recorded as a
          risk event, and infrastructure activity is logged by AWS
          CloudTrail. Application monitoring and error logging are
          configured to avoid leaking secrets or sensitive user information.
        </p>
        <p>
          <ComingSoonTag /> A full audit log of authentication events,
          account changes, strategy changes, broker connections and trading
          actions.
        </p>

        <h2>Safe failure states</h2>
        <p>
          If a broker API, market-data provider or internal service becomes
          unavailable, the platform is designed to stop new trading actions
          rather than guess, and to surface the failure clearly instead of
          failing silently.
        </p>

        <h2>Reporting a security issue</h2>
        <p>
          If you believe you&rsquo;ve found a security issue, please contact
          us through the details on the <a href="/contact">Contact</a> page
          so it can be investigated promptly.
        </p>
      </Prose>
      </Reveal>
    </>
  );
}
