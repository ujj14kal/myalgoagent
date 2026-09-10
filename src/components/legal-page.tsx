import Link from "next/link";
import Reveal from "@/components/reveal";
import { Breadcrumbs } from "@/components/section";

export interface LegalSection {
  id: string;
  title: string;
  paragraphs?: string[];
  bullets?: string[];
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
        <div className="mx-auto grid max-w-6xl gap-16 px-4 py-16 lg:grid-cols-[1fr_320px]">
          <article className="min-w-0">
            {sections.map((section, i) => (
              <section
                key={section.id}
                id={section.id}
                className="grid grid-cols-[40px_1fr] gap-4 border-b border-black/5 pb-10 mb-10 last:mb-0 last:border-0 last:pb-0 scroll-mt-24"
              >
                <span className="pt-1 font-mono text-xs font-bold text-brand-gold">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <h2 className="text-xl font-bold text-brand-navy">{section.title}</h2>
                  {section.body ?? (
                    <>
                      {section.paragraphs?.map((p, pi) => (
                        <p key={pi} className="mt-3 text-sm leading-relaxed text-brand-navy/70">
                          {p}
                        </p>
                      ))}
                      {section.bullets && (
                        <ul className="mt-4 space-y-2.5">
                          {section.bullets.map((item) => (
                            <li key={item} className="relative pl-5 text-sm leading-relaxed text-brand-navy/70">
                              <span className="absolute left-0 top-2 h-1.5 w-1.5 rounded-sm bg-brand-primary" />
                              {item}
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                  {section.extra}
                </div>
              </section>
            ))}
          </article>

          <aside className="h-fit lg:sticky lg:top-24">
            <div className="overflow-hidden rounded-xl border border-black/5 border-t-4 border-t-brand-primary bg-white">
              <div className="border-b border-black/5 px-5 py-4 text-sm font-bold text-brand-navy">On this page</div>
              <ul className="p-2">
                {sections.map((section, i) => (
                  <li key={section.id}>
                    <a
                      href={`#${section.id}`}
                      className="grid grid-cols-[24px_1fr] items-center gap-2 rounded-lg px-3 py-2 text-xs text-brand-navy/65 hover:bg-brand-primary/5 hover:text-brand-primary"
                    >
                      <span className="font-mono text-[10px] font-bold text-brand-gold">{String(i + 1).padStart(2, "0")}</span>
                      {section.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-4 rounded-xl bg-brand-primary p-5 text-white">
              <p className="text-sm font-bold text-white">Need clarification?</p>
              <p className="mt-1.5 text-xs leading-relaxed text-white/70">
                Contact our team about this document or your account.
              </p>
              <Link href="/contact" className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold hover:text-brand-gold">
                Contact us
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </Link>
            </div>
          </aside>
        </div>
      </Reveal>
    </div>
  );
}
