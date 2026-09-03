import type { Metadata } from "next";
import PageHeader from "@/components/page-header";
import { Breadcrumbs, Prose } from "@/components/section";
import { breadcrumbJsonLd, siteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "MyAlgoAgent's Privacy Policy: what data we collect (including via Google Sign-In), why we collect it, how it's stored and protected, who we share it with, your rights, and how to contact us.",
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
      <PageHeader eyebrow="Legal" title="Privacy Policy" description="Last updated: September 2026." />
      <Prose>
        <h2>Overview</h2>
        <p>
          This Privacy Policy explains how MyAlgoAgent (&ldquo;MyAlgoAgent,&rdquo;
          &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;), a product of Shagoon
          Softech Pvt. Ltd., collects, uses, stores, shares and protects
          information when you visit our website or use our algo-trading
          software platform (together, the &ldquo;Service&rdquo;). It applies to
          visitors of the public marketing site and to registered users of
          the authenticated application.
        </p>

        <h2>Information we collect</h2>
        <h3>Account information you provide directly</h3>
        <ul>
          <li>Name and email address, when you create an account.</li>
          <li>Any profile information you choose to add (e.g. display name).</li>
          <li>Communications you send us, such as support requests.</li>
        </ul>

        <h3>Information obtained through Google Sign-In</h3>
        <p>
          MyAlgoAgent offers &ldquo;Sign in with Google&rdquo; as an
          authentication method. When you choose to sign in with Google, we
          receive the following information from your Google account,
          limited strictly to what is needed to create and secure your
          account:
        </p>
        <ul>
          <li>Your name, as registered with Google.</li>
          <li>Your email address, used as your unique account identifier.</li>
          <li>Your Google account profile picture, if available, used only to display your avatar in the product.</li>
          <li>A unique, non-reversible Google account identifier used internally to link your session to your account.</li>
        </ul>
        <p>
          We request only the <code>openid</code>, <code>email</code> and{" "}
          <code>profile</code> OAuth scopes from Google &mdash; the minimum
          needed for authentication. We do not request access to your
          Gmail, Google Drive, Google Calendar, contacts, or any other
          Google service or data beyond your basic profile and email. We do
          not post to any Google service on your behalf, and we do not sell
          or share the data obtained through Google Sign-In with third
          parties for their own marketing purposes.
        </p>

        <h3>Usage and device information</h3>
        <ul>
          <li>Pages visited, features used, and general interaction patterns with the Service.</li>
          <li>Device, browser type, and approximate location derived from IP address (for security and fraud prevention, not precise geolocation).</li>
          <li>Log data such as timestamps, referring URLs and error reports.</li>
        </ul>

        <h3>Trading configuration and platform data</h3>
        <p>
          Where the authenticated application is used, we store the
          trading-related configuration you create: strategies, backtest
          settings, risk limits, and (only with your explicit
          authorization) broker connection metadata needed to synchronize
          orders and positions. We never store your broker account
          password; broker connections use that broker&rsquo;s own secure
          API authorization flow.
        </p>

        <h2>Why we collect this information</h2>
        <ul>
          <li>To create, authenticate and secure your account, including via Google Sign-In.</li>
          <li>To provide, operate and maintain the features of the Service.</li>
          <li>To detect, investigate and prevent fraudulent, unauthorized or abusive activity.</li>
          <li>To maintain audit logs required for a financial-software product handling trading actions.</li>
          <li>To communicate with you about your account, security notices, or support requests.</li>
          <li>To understand aggregate usage patterns and improve reliability and performance.</li>
          <li>To comply with applicable legal and regulatory obligations.</li>
        </ul>

        <h2>How we store and protect your information</h2>
        <p>
          Account and platform data is stored in a managed PostgreSQL
          database hosted on Amazon Web Services (AWS) infrastructure,
          protected in transit with TLS/SSL encryption verified against
          the database provider&rsquo;s own certificate authority (not
          disabled or bypassed). Sensitive credentials, including any
          broker API keys, are handled through dedicated secret-management
          infrastructure, separate from general application data, and are
          never exposed to client-side/browser code. Access to production
          data is restricted to what is operationally necessary.
        </p>

        <h2>How we share information</h2>
        <p>We do not sell your personal data. We share information only:</p>
        <ul>
          <li>With infrastructure and service providers who process data on our behalf strictly to operate the Service &mdash; for example, our cloud hosting provider (AWS), authentication provider (Google), and analytics provider (Google Analytics).</li>
          <li>With your connected broker, strictly to place, modify, cancel or synchronize orders you have configured and authorized.</li>
          <li>Where required to comply with a legal obligation, court order, or governmental request.</li>
          <li>To protect the rights, property or safety of MyAlgoAgent, our users, or the public, where legally permitted.</li>
          <li>In connection with a merger, acquisition, or sale of assets, subject to continued protection under a policy at least as protective as this one.</li>
        </ul>

        <h2>Data retention</h2>
        <p>
          We retain account and trading-configuration data for as long as
          your account remains active, and for a reasonable period
          afterward as needed to meet audit, security, tax, and legal
          record-keeping obligations applicable to financial software. You
          may request earlier deletion as described under &ldquo;Your
          rights&rdquo; below, subject to any retention we are legally
          required to maintain (for example, records of executed trades).
        </p>

        <h2>Cookies and similar technologies</h2>
        <p>
          We use essential cookies required for authentication and session
          security, and, where enabled, analytics cookies to understand
          aggregate site usage. See our{" "}
          <a href="/cookie-policy">Cookie Policy</a> for full details and
          how to manage your preferences.
        </p>

        <h2>Your rights</h2>
        <p>
          Depending on your jurisdiction, you may have the right to: access
          the personal data we hold about you; correct inaccurate data;
          request deletion of your data; export your data in a portable
          format; object to or restrict certain processing; and withdraw
          consent where processing is based on consent (such as disconnecting
          Google Sign-In or revoking access at{" "}
          <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">
            myaccount.google.com/permissions
          </a>
          ). To exercise any of these rights, contact us using the details
          below.
        </p>

        <h2>International data transfers</h2>
        <p>
          Our infrastructure is hosted on AWS and may process data in data
          centers located outside your country of residence. Where we
          transfer personal data internationally, we take steps intended
          to ensure the data continues to be protected in accordance with
          this Privacy Policy.
        </p>

        <h2>Children&rsquo;s privacy</h2>
        <p>
          The Service is not directed to, and we do not knowingly collect
          personal data from, children under the age of 18. If we become
          aware that we have collected personal data from a child without
          appropriate consent, we will take steps to delete it.
        </p>

        <h2>Changes to this policy</h2>
        <p>
          We may update this Privacy Policy from time to time to reflect
          changes to our practices or for legal, operational or regulatory
          reasons. We will update the &ldquo;Last updated&rdquo; date above
          when we do, and, where changes are material, provide additional
          notice.
        </p>

        <h2>Contact us</h2>
        <p>
          For privacy questions, data requests, or to exercise any of the
          rights above, email{" "}
          <a href="mailto:privacy@myalgoagent.com">privacy@myalgoagent.com</a>{" "}
          or see our <a href="/contact">Contact</a> page. MyAlgoAgent is
          operated by Shagoon Softech Pvt. Ltd.
        </p>

        <p className="text-sm text-brand-navy/50">
          This policy is provided to describe our actual current data
          practices and is reviewed and updated as the product evolves.
        </p>
      </Prose>
    </>
  );
}
