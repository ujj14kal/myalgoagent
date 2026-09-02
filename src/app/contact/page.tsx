import type { Metadata } from "next";
import PageHeader from "@/components/page-header";
import { Breadcrumbs, Prose } from "@/components/section";
import { breadcrumbJsonLd, siteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contact",
  description: "Get in touch with the MyAlgoAgent team.",
  alternates: { canonical: `${siteUrl}/contact` },
};

export default function ContactPage() {
  const jsonLd = breadcrumbJsonLd([
    { name: "Home", url: siteUrl },
    { name: "Contact", url: `${siteUrl}/contact` },
  ]);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Breadcrumbs items={[{ href: "/", label: "Home" }, { href: "/contact", label: "Contact" }]} />
      <PageHeader eyebrow="Contact" title="Get in touch" description="Questions about the product, security or a company inquiry — we'd like to hear from you." />
      <Prose>
        <h2>General & support inquiries</h2>
        <p>
          Email <a href="mailto:contact@myalgoagent.com">contact@myalgoagent.com</a>.
        </p>
        <h2>Security reports</h2>
        <p>
          Email <a href="mailto:security@myalgoagent.com">security@myalgoagent.com</a>{" "}
          — see our <a href="/security">Security</a> page for more detail.
        </p>
        <p className="text-sm text-brand-navy/50">
          Contact addresses are placeholders pending domain and mailbox
          setup for the production launch; update with the company&rsquo;s
          verified contact details before public launch.
        </p>
      </Prose>
    </>
  );
}
