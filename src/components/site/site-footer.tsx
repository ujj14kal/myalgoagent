import Link from "next/link";
import Image from "next/image";
import CompanyLink from "@/components/company-link";

const columns = [
  {
    title: "Product",
    links: [
      { href: "/product", label: "Product overview" },
      { href: "/features", label: "Features" },
      { href: "/backtesting", label: "Backtesting" },
      { href: "/forward-testing", label: "Forward testing" },
      { href: "/live-trading", label: "Live trading" },
      { href: "/risk-management", label: "Risk management" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About" },
      { href: "/how-it-works", label: "How it works" },
      { href: "/technology", label: "Technology & AWS" },
      { href: "/security", label: "Security" },
      { href: "/faq", label: "FAQ" },
      { href: "/contact", label: "Contact" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/risk-disclosure", label: "Risk disclosure" },
      { href: "/privacy-policy", label: "Privacy policy" },
      { href: "/terms", label: "Terms" },
      { href: "/cookie-policy", label: "Cookie policy" },
    ],
  },
];

export default function SiteFooter() {
  return (
    <footer className="mk mk-dark relative overflow-hidden" data-theme="dark">
      <div className="mk-grid-bg opacity-60" aria-hidden />
      <div className="mk-wrap relative pb-10 pt-20 sm:pt-28">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Link href="/" className="inline-flex items-center gap-2.5">
              <Image src="/brand/icon-mark.png" alt="" width={38} height={38} className="rounded-[11px]" />
              <span className="font-[family-name:var(--font-display)] text-lg font-bold tracking-tight text-white">MyAlgoAgent</span>
            </Link>
            <p className="mt-5 max-w-sm text-sm leading-relaxed">
              Software for building, backtesting and running rule-based trading strategies on your own broker account. Not investment advice.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/signup" className="mk-btn mk-btn--gold" data-magnetic="0.2">
                Start free
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </Link>
              <Link href="/contact" className="mk-btn mk-btn--ghost">
                Talk to us
              </Link>
            </div>
          </div>
          {columns.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--mk-gold)]">{col.title}</h3>
              <ul className="mt-5 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="mk-nav-link !text-sm !font-medium text-white/70 hover:text-white">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div aria-hidden className="mt-20 select-none font-[family-name:var(--font-display)] text-[clamp(3rem,13vw,11rem)] font-extrabold leading-[0.8] tracking-[-0.05em] !text-transparent [-webkit-text-stroke:1px_rgba(255,255,255,0.14)]">
          MyAlgoAgent
        </div>

        <div className="mt-10 flex items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-white/45">A product of</span>
          <CompanyLink className="inline-flex rounded-lg bg-white px-2.5 py-1.5 opacity-90 transition-opacity hover:opacity-100" aria-label="Shagoon Softech Pvt. Ltd. — company website">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/shagoon-softech-logo.svg" alt="Shagoon Softech Pvt. Ltd." className="h-5 w-auto" />
          </CompanyLink>
        </div>

        <div className="mt-6 flex flex-col gap-4 border-t border-white/10 pt-6 text-xs text-white/55 md:flex-row md:items-start md:justify-between">
          <p>
            © {new Date().getFullYear()} MyAlgoAgent™, a product of <CompanyLink className="text-white/80 hover:text-white" /> All rights reserved.
          </p>
          <p className="max-w-xl md:text-right">
            Algo trading involves risk of loss. Backtested and forward-tested results are hypothetical and don&apos;t guarantee future performance. MyAlgoAgent and Shagoon Softech Pvt. Ltd. are not registered with SEBI as a stock broker, investment adviser or research analyst.
          </p>
        </div>
      </div>
    </footer>
  );
}
