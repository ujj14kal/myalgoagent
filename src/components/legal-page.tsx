import Reveal from "@/components/reveal";
import { Breadcrumbs } from "@/components/section";
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
    <div>
      <Breadcrumbs items={[{ href: "/", label: "Home" }, { href: breadcrumbHref, label: breadcrumbLabel }]} />

      <div className="relative overflow-hidden bg-brand-navy text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-36 h-96 w-96 rotate-12 rounded-full border-[70px] border-brand-primary/40"
        />
        <div className="relative mx-auto max-w-4xl px-4 py-16">
          <span className="text-xs font-bold uppercase tracking-widest text-brand-gold">{label}</span>
          <h1 className="mt-3 text-4xl font-bold sm:text-5xl">{title}</h1>
          <p className="mt-4 max-w-2xl text-lg text-white/70">{intro}</p>
          <p className="mt-5 text-sm text-white/45">Last updated: {updated}</p>
        </div>
      </div>

      <Reveal>
        <div className="mx-auto max-w-4xl px-4 py-16">
          <article className="min-w-0">
            {sections.map((section, i) => (
              <section
                key={section.id}
                id={section.id}
                className="grid grid-cols-[40px_1fr] gap-4 border-b border-black/5 pb-10 mb-10 last:mb-0 last:border-0 last:pb-0 scroll-mt-24"
              >
                <span className="pt-1 font-mono text-xs font-bold text-brand-gold">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <h2 className="text-xl font-bold text-brand-navy">
                    {section.title}
                    {section.comingSoon && <ComingSoonTag className="ml-2.5" />}
                  </h2>
                  {section.body ?? (
                    <>
                      {section.paragraphs?.map((p, pi) => (
                        <p key={pi} className="mt-3 text-sm leading-relaxed text-brand-navy/70">
                          {withCompanyLinks(p)}
                        </p>
                      ))}
                      {section.bullets && (
                        <ul className="mt-4 space-y-2.5">
                          {section.bullets.map((item) => (
                            <li key={item} className="relative pl-5 text-sm leading-relaxed text-brand-navy/70">
                              <span className="absolute left-0 top-2 h-1.5 w-1.5 rounded-sm bg-brand-primary" />
                              {withCompanyLinks(item)}
                            </li>
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

        </div>
      </Reveal>
    </div>
  );
}
