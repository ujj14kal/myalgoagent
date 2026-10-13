import type { Metadata } from "next";
import PageHeader from "@/components/page-header";
import { Breadcrumbs, Prose } from "@/components/section";
import { breadcrumbJsonLd, siteUrl, pageMetadata } from "@/lib/site";
import Reveal from "@/components/reveal";
import CompanyLink from "@/components/company-link";

export const metadata: Metadata = pageMetadata({
  title: "About",
  description:
    "MyAlgoAgent is built by Shagoon Softech to give traders and developers a structured, risk-aware way to build and run algorithmic trading strategies.",
  path: "/about",
});

export default function AboutPage() {
  const jsonLd = breadcrumbJsonLd([
    { name: "Home", url: siteUrl },
    { name: "About", url: `${siteUrl}/about` },
  ]);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Breadcrumbs items={[{ href: "/", label: "Home" }, { href: "/about", label: "About" }]} />
      <PageHeader eyebrow="About" title="About MyAlgoAgent" description={<>Built by <CompanyLink>Shagoon Softech</CompanyLink>.</>} />
      <Reveal>
      <Prose>
        <h2>Our focus</h2>
        <p>
          MyAlgoAgent exists to make algorithmic trading approachable
          without hiding the parts that actually matter: realistic
          backtesting, honest risk disclosure, and risk controls that are
          enforced by the system rather than left to good intentions.
        </p>

        <h2>What we believe</h2>
        <ul>
          <li>A strategy should be validated on history and in forward testing before it ever touches real capital.</li>
          <li>Risk limits should be enforced server-side, not just displayed in a UI.</li>
          <li>Backtested performance is informative, not a promise — and the product should say so clearly.</li>
        </ul>

        <h2>What you can do with it today</h2>
        <ul>
          <li>Build strategies visually, as code, or by describing them to your own AI agent, and compose your own blocks, concepts and trading systems</li>
          <li>Backtest on up to five years of history with fees and slippage, and backtest several strategies together as one account</li>
          <li>Forward test on new market data, with every hypothetical trade explained</li>
          <li>Connect your own account at the brokers listed on our <a href="/features">Features</a> page and, where switched on for you, run a tested strategy live from your own static IP</li>
          <li>Read any stock&rsquo;s chart indicator by indicator with Analyst Pro, and explore options in the Options Lab</li>
          <li>Start with a free 7-day trial, then pick the plan that fits &mdash; see <a href="/pricing">Pricing</a></li>
        </ul>
        <h2>How we work</h2>
        <ul>
          <li>Every strategy rule stays visible to you &mdash; there are no black boxes and no hidden signals</li>
          <li>Our AI agent explains and drafts, you review and confirm; it never gives investment advice and never acts on its own</li>
          <li>We are software, not a broker or an adviser: we never hold your money and we do not tell you what to trade</li>
          <li>Real people answer support, and refunds, where our policy allows them, are decided by a person</li>
        </ul>
        <h2>Company</h2>
        <p>
          MyAlgoAgent is developed and operated by <CompanyLink />. For company or product inquiries, see the{" "}
          <a href="/contact">Contact</a> page.
        </p>
        <CompanyLink className="mt-4 inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/shagoon-softech-logo.svg" alt="Shagoon Softech Pvt. Ltd." className="h-8 w-auto" />
        </CompanyLink>
      </Prose>
      </Reveal>
    </>
  );
}
