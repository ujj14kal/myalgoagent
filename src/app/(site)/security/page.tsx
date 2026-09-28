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
        <h2>Your broker credentials</h2>
        <p>
          The broker API keys and daily session tokens you connect are
          encrypted with AES-256 before they&rsquo;re stored, locked to your
          account, and never sent back to your browser &mdash; not even to
          you. You log in on your broker&rsquo;s own page, so MyAlgoAgent
          never sees your broker password, PIN or 2FA codes. You can
          disconnect at any time, and MyAlgoAgent never holds your money.
        </p>

        <h2>Encryption</h2>
        <p>
          Every connection is encrypted with HTTPS, and your account data is
          encrypted at rest in secure AWS cloud infrastructure in India.
        </p>

        <h2>Your account</h2>
        <ul>
          <li>Passwords are stored only as one-way hashes &mdash; nobody at MyAlgoAgent can read yours</li>
          <li>Sign in with a password, an email link or Google; sessions are protected and can be signed out any time</li>
          <li>Repeated attempts are rate-limited to protect your account from automated attacks</li>
          <li>Every trading action is checked on our servers, so limits can&rsquo;t be bypassed from the browser</li>
        </ul>

        <h2>Who at MyAlgoAgent can see your data</h2>
        <ul>
          <li>Only a small, named team, each with the least access their role needs &mdash; support staff can answer you, only administrators can act on an account</li>
          <li>Nobody on the team can see your password, your broker keys or tokens, or your conversations with your AI agent</li>
          <li>Every action the team takes &mdash; including opening your account details &mdash; is recorded with who did it and when</li>
        </ul>

        <h2>Monitoring & backups</h2>
        <p>
          The platform is monitored around the clock and our team is alerted
          within minutes if something goes wrong. Your data is backed up
          automatically every day, and every update is tested automatically
          before it goes live. Every risk-limit breach and kill-switch block
          is recorded and sent to your notifications. Keys and passwords are
          never written to our logs, and anything like that pasted into the AI
          chat is hidden before it&rsquo;s saved.
        </p>
        <p>
          <ComingSoonTag /> A full audit log of sign-ins, account changes,
          strategy changes, broker connections and trading actions.
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
