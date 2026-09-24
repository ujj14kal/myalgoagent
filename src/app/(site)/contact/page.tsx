import type { Metadata } from "next";
import PageHeader from "@/components/page-header";
import { Breadcrumbs } from "@/components/section";
import { breadcrumbJsonLd, siteUrl, pageMetadata } from "@/lib/site";
import { auth } from "@/lib/auth";
import Reveal from "@/components/reveal";
import Agent2D from "@/components/robot/agent-2d";
import { MessageSquareText, ShieldAlert, UserRound } from "lucide-react";
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
      <div className="mx-auto grid max-w-5xl gap-8 px-4 py-14 lg:grid-cols-[1fr_340px]">
        <div className="surface p-6 sm:p-8">
          <h2 className="text-lg font-semibold text-brand-navy">Send us a message</h2>
          <p className="mt-1 text-sm text-brand-navy/60">Product questions, account help, partnerships or feedback.</p>
          <div className="mt-6">
            <SupportForm initialEmail={session?.user?.email ?? ""} />
          </div>
        </div>
        <Reveal>
          <aside className="surface overflow-hidden">
            <div className="app-sidebar-bg flex justify-center px-6 pb-1 pt-6">
              <Agent2D pose="talk" size={140} />
            </div>
            <div className="space-y-4 p-6 text-sm">
              <div className="flex gap-3">
                <MessageSquareText size={18} className="mt-0.5 shrink-0 text-brand-primary" />
                <p>Every message is read by a person on the MyAlgoAgent team — not an auto-responder.</p>
              </div>
              <div className="flex gap-3">
                <UserRound size={18} className="mt-0.5 shrink-0 text-brand-primary" />
                <p>Signed in? Your message is linked to your account, so you won&rsquo;t need to explain your setup.</p>
              </div>
              <div className="flex gap-3">
                <ShieldAlert size={18} className="mt-0.5 shrink-0 text-brand-primary" />
                <p>
                  Security reports:{" "}
                  <a href="mailto:security@myalgoagent.com" className="font-medium text-brand-primary underline">
                    security@myalgoagent.com
                  </a>{" "}
                  — see our{" "}
                  <a href="/security" className="font-medium text-brand-primary underline">
                    Security
                  </a>{" "}
                  page.
                </p>
              </div>
            </div>
          </aside>
        </Reveal>
      </div>
    </>
  );
}
