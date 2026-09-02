import type { Metadata } from "next";
import PageHeader from "@/components/page-header";
import { Breadcrumbs, Prose } from "@/components/section";
import { breadcrumbJsonLd, siteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "About",
  description:
    "MyAlgoAgent is built by Shagoon Softech to give traders and developers a structured, risk-aware way to build and run algorithmic trading strategies.",
  alternates: { canonical: `${siteUrl}/about` },
};

export default function AboutPage() {
  const jsonLd = breadcrumbJsonLd([
    { name: "Home", url: siteUrl },
    { name: "About", url: `${siteUrl}/about` },
  ]);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Breadcrumbs items={[{ href: "/", label: "Home" }, { href: "/about", label: "About" }]} />
      <PageHeader eyebrow="About" title="About MyAlgoAgent" description="Built by Shagoon Softech." />
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
          <li>A strategy should be validated on history and in paper trading before it ever touches real capital.</li>
          <li>Risk limits should be enforced server-side, not just displayed in a UI.</li>
          <li>Backtested performance is informative, not a promise — and the product should say so clearly.</li>
        </ul>

        <h2>Company</h2>
        <p>
          MyAlgoAgent is developed and operated by Shagoon Softech. For
          company or product inquiries, see the <a href="/contact">Contact</a> page.
        </p>
      </Prose>
    </>
  );
}
