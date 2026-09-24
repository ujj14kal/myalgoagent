import type { Metadata } from "next";
import PageHeader from "@/components/page-header";
import { Breadcrumbs } from "@/components/section";
import { breadcrumbJsonLd, siteUrl, pageMetadata } from "@/lib/site";
import { auth } from "@/lib/auth";
import Reveal from "@/components/reveal";
import SupportForm from "@/components/support-form";

export const metadata: Metadata = pageMetadata({
  title: "Contact",
  description:
    "Contact the MyAlgoAgent team for product questions, account or technical support, partnerships and feedback. Send a message and we'll get back to you.",
  path: "/contact",
});

export default async function ContactPage() {
  const session = await auth();
  const jsonLd = breadcrumbJsonLd([
    { name: "Home", url: siteUrl },
    { name: "Contact", url: `${siteUrl}/contact` },
  ]);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Breadcrumbs items={[{ href: "/", label: "Home" }, { href: "/contact", label: "Contact" }]} />
      <PageHeader eyebrow="Contact" title="Get in touch" description="Questions about the product, security or a company inquiry — we'd like to hear from you." />
      <Reveal>
        <div className="mx-auto max-w-lg px-4 py-14">
          <SupportForm initialEmail={session?.user?.email ?? ""} />

          <div className="mt-8 border-t border-black/5 pt-6 text-center text-sm text-brand-navy/60">
            <p>
              Security reports: email{" "}
              <a href="mailto:security@myalgoagent.com" className="text-brand-primary underline">
                security@myalgoagent.com
              </a>{" "}
              — see our <a href="/security" className="text-brand-primary underline">Security</a> page.
            </p>
          </div>
        </div>
      </Reveal>
    </>
  );
}
