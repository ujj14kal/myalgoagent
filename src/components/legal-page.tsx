import Link from "next/link";
import SiteHero from "@/components/site/site-hero";
import CapabilityIndex from "@/components/site/capability-index";
import ComingSoonTag, { ComingSoonList } from "@/components/coming-soon-tag";
import { withCompanyLinks } from "@/components/company-link";

export interface LegalSection {
  id: string;
  title: string;
  paragraphs?: string[];
  bullets?: string[];
  /** Planned items, listed after the built ones under a "Coming soon" tag. */
  soon?: string[];
  /** The whole section describes something not built yet. */
  comingSoon?: boolean;
  /**
   * Full custom content for a section — use when a paragraph needs an
   * inline <Link>, a <Callout>, or anything else plain strings can't
   * express. When set, paragraphs/bullets are ignored for this section.
   */
  body?: React.ReactNode;
  /** Rendered after the paragraphs/bullets/body, for anything that needs a link, e.g. a mailto or an external URL. */
  extra?: React.ReactNode;
}

export default function LegalPage({
  label,
  title,
  updated,
  intro,
  sections,
  breadcrumbLabel,
  breadcrumbHref,
}: {
  label: string;
  title: string;
  updated: string;
  intro: string;
  sections: LegalSection[];
  breadcrumbLabel: string;
  breadcrumbHref: string;
}) {
  return (
    <>
      <SiteHero eyebrow={label} title={title} description={intro} meta={<>Last updated: {updated}</>} crumbs={[{ href: "/", label: "Home" }, { href: breadcrumbHref, label: breadcrumbLabel }]} />

      <section className="mk-section mk-tint !pt-16 sm:!pt-24">
        <div className="mk-wrap grid gap-12 lg:grid-cols-[1fr_300px] lg:gap-20">
          <article className="min-w-0 space-y-5">
            {sections.map((section, i) => (
              <section key={section.id} id={section.id} className="mk-card scroll-mt-28 sm:!p-9" data-rise>
                <div className="flex items-baseline gap-4">
                  <span className="font-mono text-xs font-bold text-[var(--mk-gold)]">{String(i + 1).padStart(2, "0")}</span>
                  <h2 className="mk-display text-[clamp(1.25rem,2vw,1.6rem)] tracking-tight">
                    {section.title}
                    {section.comingSoon && <ComingSoonTag className="ml-2.5 align-middle" />}
                  </h2>
                </div>
                <div className="mk-prose mt-4 sm:pl-9">
                  {section.body ?? (
                    <>
                      {section.paragraphs?.map((p, pi) => (
                        <p key={pi}>{withCompanyLinks(p)}</p>
                      ))}
                      {section.bullets && (
                        <ul>
                          {section.bullets.map((item) => (
                            <li key={item}>{withCompanyLinks(item)}</li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                  {section.soon && <ComingSoonList items={section.soon} />}
                  {section.extra}
                </div>
              </section>
            ))}
          </article>

          <aside className="h-fit lg:sticky lg:top-28">
            <p className="mk-eyebrow">On this page</p>
            <div className="mt-5 hidden lg:block">
              <CapabilityIndex items={sections.map((x) => ({ id: x.id, label: x.title }))} />
            </div>
            <div className="mk-card mk-dark mt-8 !bg-[var(--mk-dark)]" data-theme="dark">
              <p className="mk-display text-lg text-white">Need clarification?</p>
              <p className="mt-2 text-sm leading-relaxed">Contact our team about this page or your account.</p>
              <Link href="/contact" className="mk-btn mk-btn--gold mt-5 !py-2.5 text-sm">
                Contact us
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </Link>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}
