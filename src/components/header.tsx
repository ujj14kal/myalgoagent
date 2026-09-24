import Link from "next/link";
import Logo from "@/components/logo";
import SiteMobileMenu from "@/components/site-mobile-menu";

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
    <header className="sticky top-0 z-40 border-b border-black/5 bg-brand-bg/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Logo />
        <nav aria-label="Primary" className="hidden items-center gap-7 md:flex">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="text-sm font-medium text-brand-navy/70 transition-colors hover:text-brand-primary">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <Link href="/login" className="hidden text-sm font-semibold text-brand-navy/80 hover:text-brand-primary md:inline">
            Sign in
          </Link>
          <Link
            href="/signup"
            className="whitespace-nowrap rounded-full bg-brand-primary px-3.5 py-1.5 text-xs font-semibold text-white shadow-[0_8px_20px_-10px_rgba(71,24,152,0.9)] transition-colors hover:bg-brand-primary-light sm:px-4 sm:py-2 sm:text-sm"
          >
            Get started
          </Link>
          <SiteMobileMenu links={links} />
        </div>
      </div>
    </header>
  );
}
