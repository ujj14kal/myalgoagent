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
          you. By default you log in on your broker&rsquo;s own page, so
          MyAlgoAgent never sees your broker password, PIN or login 2FA codes.
          If you choose Groww&rsquo;s automatic login, its API TOTP secret gets
          the same encryption and is used only to start your daily session.
          For Dhan and Angel One there is an optional automatic daily login
          that, only if you tick a consent box, keeps your PIN and 2FA secret
          sealed with a separate encryption key, used only to sign in for you
          and never shown again; anyone holding both could log in to that
          account, so turn it on only if you accept that. You can disconnect
          at any time, which deletes them, and MyAlgoAgent never holds your
          money.
        </p>

        <h2>Encryption</h2>
        <p>
          Every connection is encrypted with HTTPS, and your account data is
          encrypted at rest in secure AWS cloud infrastructure in India.
        </p>

        <h2>Your account</h2>
        <ul>
          <li>Passwords are stored only as one-way hashes &mdash; nobody at MyAlgoAgent can read yours</li>
          <li>Sign in with a password, an email link or Google (which always asks which account to use); one active sign-in per account, so a new sign-in ends the old one, and you can sign out any time</li>
          <li>Repeated attempts are rate-limited to protect your account from automated attacks</li>
          <li>Every trading action is checked on our servers, so limits can&rsquo;t be bypassed from the browser</li>
        </ul>

        <h2>Who at MyAlgoAgent can see your data</h2>
        <ul>
          <li>Only a small, named team, each with the least access their role needs &mdash; support staff can answer you, only administrators can act on an account</li>
          <li>Nobody on the team can see your password, your broker keys or tokens, or your conversations with your AI agent</li>
          <li>Every action the team takes &mdash; including opening your account details &mdash; is recorded with who did it and when</li>
        </ul>

        <h2>Payments</h2>
        <p>
          Payments are taken by Razorpay, a licensed payment provider, in its own
          secure window. Your card, UPI or netbanking details go to Razorpay and
          never reach MyAlgoAgent. We check every payment&rsquo;s signature with
          Razorpay before crediting anything, and we keep only the payment
          reference, amount and invoice, so a payment can be matched and
          refunded safely.
        </p>

        <h2>Live orders</h2>
        <ul>
          <li>On a paid plan your orders leave from your own static IP, created for you and registered on your broker account, so your broker sees one stable, known address</li>
          <li>Every order is checked on our servers first: kill switch, per-order and daily limits, duplicate protection</li>
          <li>An order is recorded before it is sent and confirmed with the broker afterwards, so it is never sent twice or guessed at</li>
          <li>A readiness check proves your broker, login and IP are in order without placing any order</li>
        </ul>

        <h2>Email you can trust</h2>
        <p>
          Our emails are sent from our own domain with SPF, DKIM and DMARC set
          up, so they can be verified as ours. We never ask for your password,
          API keys, PIN or one-time codes by email or in chat. If you reply to
          one of our emails, your reply becomes a numbered support request that
          our team answers.
        </p>

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
