import Link from "next/link";
import Logo from "@/components/logo";

const links = [
  { href: "/product", label: "Product" },
  { href: "/backtesting", label: "Backtesting" },
  { href: "/live-trading", label: "Live Trading" },
  { href: "/risk-management", label: "Risk" },
  { href: "/technology", label: "Technology" },
  { href: "/faq", label: "FAQ" },
];

export default function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-black/5 bg-brand-bg/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Logo />
        <nav aria-label="Primary" className="hidden items-center gap-8 md:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-sm font-medium text-brand-navy/70 hover:text-brand-primary"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="rounded-full bg-brand-primary px-4 py-2 text-sm font-semibold text-white hover:bg-brand-primary-light"
          >
            Get Started
          </Link>
        </div>
      </div>
    </header>
  );
}
