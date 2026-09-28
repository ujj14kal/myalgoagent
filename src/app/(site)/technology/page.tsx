import type { Metadata } from "next";
import Link from "next/link";
import LegalPage, { type LegalSection } from "@/components/legal-page";
import { breadcrumbJsonLd, siteUrl, pageMetadata } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "Technology & Security",
  description:
    "How MyAlgoAgent keeps your data, broker account and trading safe: encryption, secure AWS cloud infrastructure, server-side risk limits and round-the-clock monitoring.",
  path: "/technology",
});

const sections: LegalSection[] = [
  {
    id: "cloud",
    title: "Secure, reliable cloud infrastructure",
    paragraphs: [
      "MyAlgoAgent runs on Amazon Web Services (AWS), the same cloud infrastructure trusted by banks and brokers. Your account data is stored in AWS's Mumbai region, and the platform scales automatically, so it stays fast when markets get busy.",
    ],
  },
  {
    id: "encryption",
    title: "Your data is encrypted",
    bullets: [
      "Every connection to MyAlgoAgent is encrypted with HTTPS, and browsers are told to never connect any other way.",
      "Your account data is encrypted at rest.",
      "Your broker API keys and daily session tokens are encrypted with AES-256, locked to your account, and never sent back to your browser — not even to you.",
      "Passwords are stored only as one-way hashes; nobody at MyAlgoAgent can read your password.",
    ],
  },
  {
    id: "broker",
    title: "Your broker account stays in your control",
    bullets: [
      "You log in on your broker's own page — MyAlgoAgent never sees your broker password, PIN or 2FA codes.",
      "Disconnect from MyAlgoAgent at any time, or revoke access from your broker's side.",
      "MyAlgoAgent never holds your money; your funds stay with your broker.",
    ],
  },
  {
    id: "risk",
    title: "Safety limits enforced by the server",
    paragraphs: [
      "Your loss limits, losing-streak limit and kill switch are checked on our servers before any new position — not just in your browser — so they keep protecting you even if you close the app.",
    ],
  },
  {
    id: "reliability",
    title: "Monitored around the clock, backed up every day",
    bullets: [
      "The platform is monitored continuously, and our team is alerted within minutes if anything goes wrong.",
      "Your data is backed up automatically every day and kept for seven days.",
      "Every update is automatically tested before it can go live, so a change can't break the platform you rely on.",
      "Requests are rate-limited to protect accounts from abuse and automated attacks.",
    ],
  },
  {
    id: "ai",
    title: "An AI agent with guardrails",
    bullets: [
      "Your agent never acts on its own — everything it prepares opens a review for you to confirm.",
      "Conversations are screened by safety guardrails, and it never gives buy or sell calls.",
      "If you paste a key or password into the chat, it's hidden before it's saved.",
      "Voice is optional and only on while you use it; your audio isn't stored.",
    ],
  },
  {
    id: "note",
    title: "Important note",
    body: (
      <p className="mt-3 text-sm leading-relaxed text-brand-navy/70">
        MyAlgoAgent is not endorsed, sponsored, certified or partnered with Amazon or AWS. AWS is used as third-party cloud
        infrastructure, the same way any software company uses a cloud provider. See also our{" "}
        <Link href="/security" className="text-brand-primary underline">Security</Link> and{" "}
        <Link href="/privacy-policy" className="text-brand-primary underline">Privacy Policy</Link> pages.
      </p>
    ),
  },
];

export default function TechnologyPage() {
  const jsonLd = breadcrumbJsonLd([
    { name: "Home", url: siteUrl },
    { name: "Technology & Security", url: `${siteUrl}/technology` },
  ]);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <LegalPage
        label="Product / Technology"
        title="Built to keep your data and trading safe"
        updated="September 2026"
        intro="What the technology behind MyAlgoAgent does for you: protecting your data, your broker account and every trade."
        sections={sections}
        breadcrumbLabel="Technology & Security"
        breadcrumbHref="/technology"
      />
    </>
  );
}
