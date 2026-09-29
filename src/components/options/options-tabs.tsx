import Link from "next/link";

const TABS = [
  { href: "/app/options", label: "Chain & payoff" },
  { href: "/app/options/strategies", label: "Strategies & backtests" },
];

export default function OptionsTabs({ active }: { active: string }) {
  return (
    <nav className="mt-4 flex gap-1 border-b border-black/[0.06]" aria-label="Options Lab">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${active === t.href ? "border-brand-primary text-brand-primary" : "border-transparent text-brand-navy/55 hover:text-brand-navy"}`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
