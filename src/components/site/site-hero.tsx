import Link from "next/link";
import { PageMotion } from "./site-motion";

/**
 * The hero every inner marketing page opens with — same language as the home page: dark, a parallax
 * grid with glows, a giant outlined word, an eyebrow, a split-text headline. It also switches on the
 * page's scroll effects (PageMotion), so a page using it needs nothing else.
 */
export default function SiteHero({
  eyebrow,
  title,
  description,
  crumbs,
  meta,
  word,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: React.ReactNode;
  crumbs?: { href: string; label: string }[];
  meta?: React.ReactNode;
  /** Giant outlined background word; defaults to the title's first word. */
  word?: string;
  children?: React.ReactNode;
}) {
  const bg = (word ?? title.split(/\s+/)[0]).replace(/[^A-Za-z&-]/g, "").toUpperCase();
  return (
    <>
      <section data-full-bleed data-theme="dark" className="mk-dark relative isolate overflow-hidden pb-20 pt-36 sm:pb-28 sm:pt-44">
        <div className="mk-grid-bg" data-speed="0.15" aria-hidden />
        <div className="mk-glow -right-24 -top-24 h-[420px] w-[420px] bg-[var(--mk-accent)]" data-speed="0.4" aria-hidden />
        <div className="mk-glow -bottom-32 left-[10%] h-[320px] w-[320px] bg-[var(--mk-gold)] !opacity-25" data-speed="0.6" aria-hidden />
        <div className="mk-ring right-[8%] top-[18%] h-64 w-64 text-[var(--mk-gold)]" data-speed="0.3" aria-hidden />
        <div className="mk-outline-word -bottom-[0.12em] right-[-2%] text-[18vw]" data-speed="0.25" aria-hidden>
          {bg}
        </div>
        <div className="mk-wrap relative">
          {crumbs && crumbs.length > 0 && (
            <nav aria-label="Breadcrumb" className="mb-8 text-sm text-white/45" data-rise>
              <ol className="flex flex-wrap items-center gap-2">
                {crumbs.map((c, i) => (
                  <li key={c.href} className="flex items-center gap-2">
                    {i > 0 && <span aria-hidden>/</span>}
                    {i === crumbs.length - 1 ? (
                      <span className="text-white/75" aria-current="page">
                        {c.label}
                      </span>
                    ) : (
                      <Link href={c.href} className="hover:text-white">
                        {c.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ol>
            </nav>
          )}
          <div data-hero-drift className="max-w-4xl">
            {eyebrow && (
              <p className="mk-eyebrow" data-rise>
                {eyebrow}
              </p>
            )}
            <h1 className="mk-display mk-h2 mt-6 text-white" data-split="now" data-delay="0.1">
              {title}
            </h1>
            {description && (
              <p className="mk-lead mt-6 max-w-2xl" data-rise data-delay="0.3">
                {description}
              </p>
            )}
            {meta && (
              <div className="mt-6 text-sm text-white/45" data-rise data-delay="0.4">
                {meta}
              </div>
            )}
            {children && (
              <div className="mt-8 flex flex-wrap gap-3" data-rise data-delay="0.45">
                {children}
              </div>
            )}
          </div>
        </div>
      </section>
      <PageMotion />
    </>
  );
}
