import type { Metadata } from "next";
import LegalPage, { type LegalSection } from "@/components/legal-page";
import { breadcrumbJsonLd, siteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "MyAlgoAgent's Privacy Policy: what data we collect (including via Google and GitHub sign-in), why we collect it, how it's stored and protected, who we share it with, your rights, and how to contact us.",
  alternates: { canonical: `${siteUrl}/privacy-policy` },
};

const sections: LegalSection[] = [
  {
    id: "overview",
    title: "Overview",
    paragraphs: [
      "This Privacy Policy explains how MyAlgoAgent (“MyAlgoAgent,” “we,” “us,” or “our”), a product of Shagoon Softech Pvt. Ltd., collects, uses, stores, shares and protects information when you visit our website or use our algo-trading software platform (together, the “Service”). It applies to visitors of the public marketing site and to registered users of the authenticated application.",
    ],
  },
  {
    id: "information",
    title: "Information we collect",
    paragraphs: [
      "Account information you provide directly: name and email address when you create an account, any profile information you choose to add, and communications you send us such as support requests.",
      "Usage and device information: pages visited, features used, device and browser type, approximate location derived from IP address (for security and fraud prevention, not precise geolocation), and log data such as timestamps, referring URLs and error reports.",
      "Trading configuration and platform data: strategies, backtest settings, risk limits, and (only with your explicit authorization) broker-connection metadata needed to synchronize orders and positions. We never store your broker account password — broker connections use that broker's own secure API authorization flow.",
    ],
  },
  {
    id: "google-sign-in",
    title: "Information obtained through Google Sign-In",
    paragraphs: [
      "When you choose to sign in with Google, we receive your name, your email address (used as your unique account identifier), your Google profile picture if available, and a unique, non-reversible Google account identifier used internally to link your session to your account.",
      "We request only the openid, email and profile OAuth scopes from Google — the minimum needed for authentication. We do not request access to your Gmail, Google Drive, Google Calendar, contacts, or any other Google service or data. We do not post to any Google service on your behalf, and we do not sell or share this data with third parties for their own marketing purposes.",
    ],
  },
  {
    id: "github-sign-in",
    title: "Information obtained through GitHub Sign-In",
    paragraphs: [
      "MyAlgoAgent also offers Sign in with GitHub, primarily for users who want to import strategy code from their own GitHub repositories into the code-mode strategy editor. When you choose to sign in with GitHub, we receive your name and username, your email address (used as your unique account identifier), your GitHub profile picture if available, and read access to your repository contents (the repo scope) — used only when you explicitly choose to import a file into a strategy. We do not read, scan, or store your repositories in the background.",
      "We do not write to, modify, or post to any GitHub repository on your behalf, and we do not sell or share this data with third parties for their own marketing purposes. You can unlink your GitHub account at any time from Account settings (subject to always keeping at least one working way to sign in), or revoke MyAlgoAgent's access entirely from github.com/settings/applications.",
    ],
  },
  {
    id: "why",
    title: "Why we collect this information",
    bullets: [
      "To create, authenticate and secure your account, including via Google and GitHub Sign-In.",
      "To provide, operate and maintain the features of the Service.",
      "To detect, investigate and prevent fraudulent, unauthorized or abusive activity.",
      "To maintain audit logs required for a financial-software product handling trading actions.",
      "To communicate with you about your account, security notices, or support requests.",
      "To understand aggregate usage patterns and improve reliability and performance.",
      "To comply with applicable legal and regulatory obligations.",
    ],
  },
  {
    id: "storage",
    title: "How we store and protect your information",
    paragraphs: [
      "Account and platform data is stored in a managed PostgreSQL database hosted on Amazon Web Services (AWS) infrastructure, protected in transit with TLS/SSL encryption. Sensitive credentials, including any broker API keys, are handled through dedicated secret-management infrastructure, separate from general application data, and are never exposed to client-side/browser code. Access to production data is restricted to what is operationally necessary.",
    ],
  },
  {
    id: "sharing",
    title: "How we share information",
    paragraphs: ["We do not sell your personal data. We share information only:"],
    bullets: [
      "With infrastructure and service providers who process data on our behalf strictly to operate the Service.",
      "With your connected broker, strictly to place, modify, cancel or synchronize orders you have configured and authorized.",
      "Where required to comply with a legal obligation, court order, or governmental request.",
      "To protect the rights, property or safety of MyAlgoAgent, our users, or the public, where legally permitted.",
      "In connection with a merger, acquisition, or sale of assets, subject to continued protection under a policy at least as protective as this one.",
    ],
    extra: (
      <p className="mt-4 text-sm leading-relaxed text-brand-navy/70">
        Our sub-processors — companies that process data on our behalf under the categories above — are: Amazon Web Services (hosting, database, and email delivery), Google (OAuth sign-in and analytics), and GitHub (OAuth sign-in and code import).
      </p>
    ),
  },
  {
    id: "email",
    title: "Email communications",
    paragraphs: [
      "We send transactional email only — never marketing or bulk email, and never to a purchased or imported list. Every email we send is triggered directly by an action you take: account verification, a password-reset link, a sign-in (“magic link”) email, or a confirmation that we received a support request or feedback you submitted. If an email to your address bounces or you mark one as spam, our provider (Amazon SES) automatically suppresses future sends to that address until the issue is resolved.",
    ],
  },
  {
    id: "retention",
    title: "Data retention",
    paragraphs: [
      "We retain account and trading-configuration data for as long as your account remains active, and for a reasonable period afterward as needed to meet audit, security, tax, and legal record-keeping obligations applicable to financial software. You may request earlier deletion as described under “Your rights” below, subject to any retention we are legally required to maintain (for example, records of executed trades).",
    ],
  },
  {
    id: "cookies",
    title: "Cookies and similar technologies",
    paragraphs: [
      "We use essential cookies required for authentication and session security, and, where enabled, analytics cookies to understand aggregate site usage. See our Cookie Policy for full details and how to manage your preferences.",
    ],
  },
  {
    id: "rights",
    title: "Your rights",
    paragraphs: [
      "Depending on your jurisdiction, you may have the right to: access the personal data we hold about you; correct inaccurate data; request deletion of your data; export your data in a portable format; object to or restrict certain processing; and withdraw consent where processing is based on consent (such as disconnecting Google or GitHub sign-in, or revoking access from that provider's own account settings). To exercise any of these rights, contact us using the details below. We aim to respond to any data request within 30 days.",
    ],
  },
  {
    id: "international",
    title: "International data transfers",
    paragraphs: [
      "Our infrastructure is hosted on AWS and may process data in data centers located outside your country of residence. Where we transfer personal data internationally, we take steps intended to ensure the data continues to be protected in accordance with this Privacy Policy.",
    ],
  },
  {
    id: "children",
    title: "Children’s privacy",
    paragraphs: [
      "The Service is not directed to, and we do not knowingly collect personal data from, children under the age of 18. If we become aware that we have collected personal data from a child without appropriate consent, we will take steps to delete it.",
    ],
  },
  {
    id: "changes",
    title: "Changes to this policy",
    paragraphs: [
      "We may update this Privacy Policy from time to time to reflect changes to our practices or for legal, operational or regulatory reasons. We will update the “Last updated” date above when we do, and, where changes are material, provide additional notice.",
    ],
  },
  {
    id: "contact",
    title: "Contact us",
    paragraphs: [
      "For privacy questions, data requests, or to exercise any of the rights above, email privacy@myalgoagent.com or see our Contact page. MyAlgoAgent is operated by Shagoon Softech Pvt. Ltd.",
    ],
  },
];

export default function PrivacyPolicyPage() {
  const jsonLd = breadcrumbJsonLd([
    { name: "Home", url: siteUrl },
    { name: "Privacy Policy", url: `${siteUrl}/privacy-policy` },
  ]);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <LegalPage
        label="Legal / Data protection"
        title="Privacy Policy"
        updated="September 2026"
        intro="A clear account of what we collect, why we need it, and the controls available to you."
        sections={sections}
        breadcrumbLabel="Privacy Policy"
        breadcrumbHref="/privacy-policy"
      />
    </>
  );
}
