import type { Metadata } from "next";
import PageHeader from "@/components/page-header";
import { Breadcrumbs, Prose } from "@/components/section";
import { breadcrumbJsonLd, siteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms & Conditions",
  description: "Terms of service for using the my ALGO agent platform.",
  alternates: { canonical: `${siteUrl}/terms` },
};

export default function TermsPage() {
  const jsonLd = breadcrumbJsonLd([
    { name: "Home", url: siteUrl },
    { name: "Terms & Conditions", url: `${siteUrl}/terms` },
  ]);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Breadcrumbs items={[{ href: "/", label: "Home" }, { href: "/terms", label: "Terms" }]} />
      <PageHeader eyebrow="Legal" title="Terms & Conditions" description="Last updated: draft — pending legal review." />
      <Prose>
        <h2>Acceptance</h2>
        <p>
          By creating an account or using my ALGO agent, you agree to these
          Terms, our <a href="/privacy-policy">Privacy Policy</a> and our{" "}
          <a href="/risk-disclosure">Risk Disclosure</a>.
        </p>

        <h2>The service</h2>
        <p>
          my ALGO agent provides software for building, backtesting, paper
          trading and — where a broker is connected — live-executing
          rule-based trading strategies. We are a software provider, not a
          broker-dealer, exchange or investment advisor.
        </p>

        <h2>Eligibility</h2>
        <p>
          You must be legally able to enter into these Terms and, for live
          trading, legally able to trade the relevant markets in your
          jurisdiction.
        </p>

        <h2>Your account</h2>
        <p>
          You are responsible for the security of your account credentials
          and for all activity under your account, including strategies you
          create or authorize to trade.
        </p>

        <h2>Broker connections</h2>
        <p>
          Connecting a broker account authorizes my ALGO agent to place,
          modify and cancel orders on your behalf strictly according to the
          strategies you configure and start. You may disconnect a broker
          or trigger the kill switch at any time.
        </p>

        <h2>No guarantee of results</h2>
        <p>
          We do not guarantee any level of trading performance, uptime, or
          that any strategy will be profitable. See our{" "}
          <a href="/risk-disclosure">Risk Disclosure</a>.
        </p>

        <h2>Prohibited use</h2>
        <p>
          You may not use the platform for unlawful purposes, to
          circumvent broker or exchange rules, or to interfere with the
          platform&rsquo;s security or operation.
        </p>

        <h2>Limitation of liability</h2>
        <p>
          To the maximum extent permitted by law, my ALGO agent is not
          liable for trading losses, lost profits, or indirect damages
          arising from your use of the platform.
        </p>

        <h2>Changes</h2>
        <p>
          We may update these Terms from time to time. Continued use of the
          platform after changes take effect constitutes acceptance.
        </p>

        <h2>Contact</h2>
        <p><a href="/contact">Contact us</a> with questions about these Terms.</p>

        <p className="text-sm text-brand-navy/50">
          This page is a template and must be reviewed by qualified legal
          counsel for your jurisdiction and business model before public
          launch.
        </p>
      </Prose>
    </>
  );
}
