import type { Metadata } from "next";
import PageHeader from "@/components/page-header";
import { Breadcrumbs, Prose } from "@/components/section";
import { breadcrumbJsonLd, siteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Cookie Policy",
  description: "How my ALGO agent uses cookies and similar technologies.",
  alternates: { canonical: `${siteUrl}/cookie-policy` },
};

export default function CookiePolicyPage() {
  const jsonLd = breadcrumbJsonLd([
    { name: "Home", url: siteUrl },
    { name: "Cookie Policy", url: `${siteUrl}/cookie-policy` },
  ]);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Breadcrumbs items={[{ href: "/", label: "Home" }, { href: "/cookie-policy", label: "Cookie Policy" }]} />
      <PageHeader eyebrow="Legal" title="Cookie Policy" description="Last updated: draft — pending legal review." />
      <Prose>
        <h2>What we use cookies for</h2>
        <ul>
          <li><strong>Essential cookies</strong> — required for authentication and session security; the platform cannot function without these.</li>
          <li><strong>Preference cookies</strong> — remember settings such as theme or dashboard layout.</li>
          <li><strong>Analytics cookies</strong> — help us understand aggregate usage so we can improve the product, where enabled.</li>
        </ul>
        <h2>Managing cookies</h2>
        <p>
          You can control or delete cookies through your browser settings.
          Blocking essential cookies may prevent you from logging in or
          using authenticated features.
        </p>
        <h2>Contact</h2>
        <p><a href="/contact">Contact us</a> with questions about this policy.</p>
        <p className="text-sm text-brand-navy/50">
          This page is a template and must be reviewed by qualified legal
          counsel and updated to reflect the actual analytics/tracking
          tools in use before public launch.
        </p>
      </Prose>
    </>
  );
}
