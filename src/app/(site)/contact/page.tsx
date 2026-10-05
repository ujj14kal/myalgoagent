import type { Metadata } from "next";
import PageHeader from "@/components/page-header";
import { breadcrumbJsonLd, siteUrl, pageMetadata } from "@/lib/site";
import { auth } from "@/lib/auth";
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
      <PageHeader crumbs={[{ href: "/", label: "Home" }, { href: "/contact", label: "Contact" }]} eyebrow="Contact" title="Get in touch" description="Questions about the product, security or a company inquiry — we'd like to hear from you." />
      <section className="mk-section mk-tint !pt-14 sm:!pt-20">
        <div className="mk-wrap grid gap-8 lg:grid-cols-[1fr_360px]">
          <div className="mk-card sm:!p-10" data-rise>
            <p className="mk-eyebrow">Send us a message</p>
            <h2 className="mk-display mk-h3 mt-4">Product questions, account help, partnerships or feedback.</h2>
            <div className="mt-8">
              <SupportForm initialEmail={session?.user?.email ?? ""} />
            </div>
          </div>
          <aside className="mk-card mk-dark overflow-hidden !bg-[var(--mk-dark)] !p-0" data-theme="dark" data-rise data-delay="0.1">
            <div className="flex justify-center bg-[radial-gradient(circle_at_50%_60%,rgba(106,53,194,0.45),transparent_70%)] px-6 pb-1 pt-8">
              <Agent2D pose="talk" size={140} />
            </div>
            <div className="space-y-5 p-7 text-sm">
              <div className="flex gap-3">
                <MessageSquareText size={18} className="mt-0.5 shrink-0 text-[var(--mk-gold)]" />
                <p>Every message is read by a person on the MyAlgoAgent team — not an auto-responder.</p>
              </div>
              <div className="flex gap-3">
                <UserRound size={18} className="mt-0.5 shrink-0 text-[var(--mk-gold)]" />
                <p>Signed in? Your message is linked to your account, so you won&rsquo;t need to explain your setup.</p>
              </div>
              <div className="flex gap-3">
                <ShieldAlert size={18} className="mt-0.5 shrink-0 text-[var(--mk-gold)]" />
                <p>
                  Security reports:{" "}
                  <a href="mailto:security@myalgoagent.com" className="font-medium text-white underline">
                    security@myalgoagent.com
                  </a>{" "}
                  — see our{" "}
                  <a href="/security" className="font-medium text-white underline">
                    Security
                  </a>{" "}
                  page.
                </p>
              </div>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}
