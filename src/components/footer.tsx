import Link from "next/link";
import Logo from "@/components/logo";

const columns = [
  {
    title: "Product",
    links: [
      { href: "/product", label: "Product Overview" },
      { href: "/features", label: "Features" },
      { href: "/backtesting", label: "Backtesting" },
      { href: "/paper-trading", label: "Paper Trading" },
      { href: "/live-trading", label: "Live Trading" },
      { href: "/risk-management", label: "Risk Management" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About" },
      { href: "/technology", label: "Technology & AWS" },
      { href: "/security", label: "Security" },
      { href: "/faq", label: "FAQ" },
      { href: "/contact", label: "Contact" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/risk-disclosure", label: "Risk Disclosure" },
      { href: "/privacy-policy", label: "Privacy Policy" },
      { href: "/terms", label: "Terms" },
      { href: "/cookie-policy", label: "Cookie Policy" },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="border-t border-black/5 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          <div className="col-span-2">
            <Logo />
            <p className="mt-3 max-w-xs text-sm text-brand-navy/60">
              Software for building, backtesting and running rule-based
              trading strategies. Not investment advice.
            </p>
          </div>
          {columns.map((col) => (
            <div key={col.title}>
              <h3 className="relative inline-block text-sm font-semibold text-brand-navy after:absolute after:-bottom-1.5 after:left-0 after:h-0.5 after:w-6 after:rounded-full after:bg-brand-gold">
                {col.title}
              </h3>
              <ul className="mt-4 space-y-2">
                {col.links.map((l, j) => (
                  <li key={col.title + l.label + j}>
                    <Link
                      href={l.href}
                      className="text-sm text-brand-navy/60 transition-colors hover:text-brand-blue"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col items-center justify-center gap-3 border-t border-black/5 pt-8">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-brand-navy/40">
              A product of
            </span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/shagoon-softech-logo.svg"
              alt="Shagoon Softech Pvt. Ltd."
              className="h-5 w-auto opacity-80"
            />
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-2 border-t border-black/5 pt-6 text-xs text-brand-navy/50 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} MyAlgoAgent™, a product of Shagoon Softech Pvt. Ltd. All rights reserved.</p>
          <p>
            Algo trading involves risk. Backtested and historical results do
            not guarantee future performance.
          </p>
        </div>
      </div>
    </footer>
  );
}
