import type { Metadata } from "next";
import LegalPage, { type LegalSection } from "@/components/legal-page";
import { breadcrumbJsonLd, siteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms & Conditions",
  description: "Terms of service for using the MyAlgoAgent platform.",
  alternates: { canonical: `${siteUrl}/terms` },
};

const sections: LegalSection[] = [
  {
    id: "acceptance",
    title: "Acceptance",
    paragraphs: [
      "By creating an account or using MyAlgoAgent™, you agree to these Terms, our Privacy Policy and our Risk Disclosure. If you do not agree, do not access or use the Service.",
    ],
  },
  {
    id: "service",
    title: "The service",
    paragraphs: [
      "MyAlgoAgent provides software for building, backtesting, paper trading and — where a broker is connected — live-executing rule-based trading strategies. We are a software provider, not a broker-dealer, exchange or investment advisor.",
    ],
  },
  {
    id: "advice",
    title: "No fiduciary or advisory relationship",
    paragraphs: [
      "Using MyAlgoAgent does not create a fiduciary, advisory or agency relationship between you and MyAlgoAgent or Shagoon Softech Pvt. Ltd. We do not evaluate the suitability of any strategy for your personal financial circumstances, and nothing in the Service should be read as a recommendation to buy, sell or hold any security.",
    ],
  },
  {
    id: "eligibility",
    title: "Eligibility & regulatory compliance",
    paragraphs: [
      "You must be legally able to enter into these Terms and, for live trading, legally able to trade the relevant markets in your jurisdiction. If you enable live trading through a connected broker in India, you are solely responsible for complying with applicable Indian securities law and SEBI regulations governing algorithmic trading and API-based order placement, including any broker- or exchange-level registration or tagging requirements that apply to your account.",
    ],
  },
  {
    id: "account",
    title: "Your account & communications",
    paragraphs: [
      "You are responsible for the security of your account credentials and for all activity under your account, including strategies you create or authorize to trade.",
      "By creating an account, you consent to receive transactional emails necessary to operate it — account verification, sign-in links, password resets, and security notices. We do not send marketing email. See our Privacy Policy for how we handle bounces, complaints and unsubscribe requests.",
    ],
  },
  {
    id: "brokers",
    title: "Broker connections",
    paragraphs: [
      "Connecting a broker account authorizes MyAlgoAgent to place, modify and cancel orders on your behalf strictly according to the strategies you configure and start. You may disconnect a broker or trigger the kill switch at any time.",
    ],
  },
  {
    id: "results",
    title: "No guarantee of results",
    paragraphs: [
      "We do not guarantee any level of trading performance, uptime, or that any strategy will be profitable. See our Risk Disclosure.",
    ],
  },
  {
    id: "prohibited",
    title: "Prohibited use",
    paragraphs: [
      "You may not use the platform for unlawful purposes, to circumvent broker or exchange rules, or to interfere with the platform's security or operation.",
    ],
  },
  {
    id: "liability",
    title: "Limitation of liability",
    paragraphs: [
      "To the maximum extent permitted by law, MyAlgoAgent and Shagoon Softech Pvt. Ltd. are not liable for trading losses, lost profits, or indirect, incidental or consequential damages arising from your use of the platform, including losses caused by broker-API outages, market-data errors, or your own configuration of a strategy or risk limits.",
    ],
  },
  {
    id: "indemnification",
    title: "Indemnification",
    paragraphs: [
      "You agree to indemnify and hold MyAlgoAgent and Shagoon Softech Pvt. Ltd. harmless from claims, losses or expenses arising from your breach of these Terms, your trading activity, or your misuse of the Service.",
    ],
  },
  {
    id: "termination",
    title: "Termination",
    paragraphs: [
      "You may stop using the Service and close your account at any time. We may suspend or terminate access for breach of these Terms, suspected fraud or abuse, or as required by law, with notice where reasonably practicable.",
    ],
  },
  {
    id: "general",
    title: "Force majeure, notices & severability",
    paragraphs: [
      "We are not liable for any failure or delay in the Service caused by events outside our reasonable control, including exchange or broker-API outages, internet or cloud-provider disruptions, natural disasters, or government action.",
      "We may give you notice under these Terms by email to the address on your account, or by posting a notice on this page. If any provision of these Terms is found unenforceable, the remaining provisions remain in full effect. These Terms, together with our Privacy Policy and Risk Disclosure, are the entire agreement between you and MyAlgoAgent regarding the Service, superseding any prior agreements on the same subject.",
    ],
  },
  {
    id: "law",
    title: "Governing law & dispute resolution",
    paragraphs: [
      "These Terms are governed by the laws of India. Any dispute arising out of or relating to these Terms or the Service will be subject to the exclusive jurisdiction of the courts located in India, without regard to conflict-of-law principles, except where mandatory local consumer-protection law provides otherwise.",
    ],
  },
  {
    id: "changes",
    title: "Changes & contact",
    paragraphs: [
      "We may update these Terms from time to time. Continued use of the platform after changes take effect constitutes acceptance. Contact us with questions about these Terms.",
      "This page reflects our current terms and is reviewed and updated as the product evolves; it should still be reviewed by qualified legal counsel for your jurisdiction and business model before the live-trading feature goes to public launch.",
    ],
  },
];

export default function TermsPage() {
  const jsonLd = breadcrumbJsonLd([
    { name: "Home", url: siteUrl },
    { name: "Terms & Conditions", url: `${siteUrl}/terms` },
  ]);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <LegalPage
        label="Legal / Platform use"
        title="Terms & Conditions"
        updated="September 2026"
        intro="The rules, responsibilities and risk terms that govern use of the MyAlgoAgent platform."
        sections={sections}
        breadcrumbLabel="Terms"
        breadcrumbHref="/terms"
      />
    </>
  );
}
