import type { Metadata } from "next";
import PageHeader from "@/components/page-header";
import { Breadcrumbs, Prose, Callout, LegalAttribution } from "@/components/section";
import { breadcrumbJsonLd, siteUrl } from "@/lib/site";
import Reveal from "@/components/reveal";

export const metadata: Metadata = {
  title: "Terms & Conditions",
  description: "Terms of service for using the MyAlgoAgent platform.",
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
      <Reveal>
      <Prose>
        <h2>Acceptance</h2>
        <p>
          By creating an account or using MyAlgoAgent&trade;, you agree to these
          Terms, our <a href="/privacy-policy">Privacy Policy</a> and our{" "}
          <a href="/risk-disclosure">Risk Disclosure</a>.
        </p>

        <h2>The service</h2>
        <p>
          MyAlgoAgent provides software for building, backtesting, paper
          trading and — where a broker is connected — live-executing
          rule-based trading strategies. We are a software provider, not a
          broker-dealer, exchange or investment advisor.
        </p>

        <h2>No fiduciary or advisory relationship</h2>
        <Callout tone="gold">
          Using MyAlgoAgent does not create a fiduciary, advisory or
          agency relationship between you and MyAlgoAgent or Shagoon
          Softech Pvt. Ltd. We do not evaluate the suitability of any
          strategy for your personal financial circumstances, and nothing
          in the Service should be read as a recommendation to buy, sell
          or hold any security.
        </Callout>

        <h2>Eligibility &amp; regulatory compliance</h2>
        <p>
          You must be legally able to enter into these Terms and, for live
          trading, legally able to trade the relevant markets in your
          jurisdiction. If you enable live trading through a connected
          broker in India, you are solely responsible for complying with
          applicable Indian securities law and SEBI regulations governing
          algorithmic trading and API-based order placement, including any
          broker- or exchange-level registration or tagging requirements
          that apply to your account.
        </p>

        <h2>Your account</h2>
        <p>
          You are responsible for the security of your account credentials
          and for all activity under your account, including strategies you
          create or authorize to trade.
        </p>

        <h2>Broker connections</h2>
        <p>
          Connecting a broker account authorizes MyAlgoAgent to place,
          modify and cancel orders on your behalf strictly according to the
          strategies you configure and start. You may disconnect a broker
          or trigger the kill switch at any time.
        </p>

        <h2>No guarantee of results</h2>
        <Callout tone="gold">
          We do not guarantee any level of trading performance, uptime, or
          that any strategy will be profitable. See our{" "}
          <a href="/risk-disclosure">Risk Disclosure</a>.
        </Callout>

        <h2>Prohibited use</h2>
        <p>
          You may not use the platform for unlawful purposes, to
          circumvent broker or exchange rules, or to interfere with the
          platform&rsquo;s security or operation.
        </p>

        <h2>Limitation of liability</h2>
        <Callout tone="gold">
          To the maximum extent permitted by law, MyAlgoAgent and Shagoon
          Softech Pvt. Ltd. are not liable for trading losses, lost
          profits, or indirect, incidental or consequential damages
          arising from your use of the platform, including losses caused
          by broker-API outages, market-data errors, or your own
          configuration of a strategy or risk limits.
        </Callout>

        <h2>Indemnification</h2>
        <p>
          You agree to indemnify and hold MyAlgoAgent and Shagoon Softech
          Pvt. Ltd. harmless from claims, losses or expenses arising from
          your breach of these Terms, your trading activity, or your
          misuse of the Service.
        </p>

        <h2>Termination</h2>
        <p>
          You may stop using the Service and close your account at any
          time. We may suspend or terminate access for breach of these
          Terms, suspected fraud or abuse, or as required by law, with
          notice where reasonably practicable.
        </p>

        <h2>Governing law &amp; dispute resolution</h2>
        <p>
          These Terms are governed by the laws of India. Any dispute
          arising out of or relating to these Terms or the Service will be
          subject to the exclusive jurisdiction of the courts located in
          India, without regard to conflict-of-law principles, except
          where mandatory local consumer-protection law provides
          otherwise.
        </p>

        <h2>Changes</h2>
        <p>
          We may update these Terms from time to time. Continued use of the
          platform after changes take effect constitutes acceptance.
        </p>

        <h2>Contact</h2>
        <p><a href="/contact">Contact us</a> with questions about these Terms.</p>

        <p className="text-sm text-brand-navy/50">
          This page reflects our current terms and is reviewed and updated
          as the product evolves; it should still be reviewed by qualified
          legal counsel for your jurisdiction and business model before
          the live-trading feature goes to public launch.
        </p>
        <LegalAttribution />
      </Prose>
      </Reveal>
    </>
  );
}
