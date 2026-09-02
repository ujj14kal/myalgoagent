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
              <h3 className="text-sm font-semibold text-brand-navy">
                {col.title}
              </h3>
              <ul className="mt-3 space-y-2">
                {col.links.map((l, i) => (
                  <li key={col.title + l.label + i}>
                    <Link
                      href={l.href}
                      className="text-sm text-brand-navy/60 hover:text-brand-primary"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-10 flex flex-col gap-2 border-t border-black/5 pt-6 text-xs text-brand-navy/50 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} MyAlgoAgent™. All rights reserved.</p>
          <p>
            Algo trading involves risk. Backtested and historical results do
            not guarantee future performance.
          </p>
        </div>
      </div>
    </footer>
  );
}
