import Link from "next/link";
import Image from "next/image";

const navGroups = [
  {
    label: "Trading",
    items: [
      { href: "/app/dashboard", label: "Dashboard" },
      { href: "/app/instruments", label: "Market Data" },
      { href: "/app/strategies", label: "Strategies" },
      { href: "/app/backtests", label: "Backtests" },
      { href: "/app/paper-trading", label: "Paper Trading" },
      { href: "/app/live-trading", label: "Live Trading" },
    ],
  },
  {
    label: "Portfolio",
    items: [
      { href: "/app/portfolio", label: "Portfolio" },
      { href: "/app/orders", label: "Orders" },
      { href: "/app/positions", label: "Positions" },
      { href: "/app/watchlist", label: "Watchlist" },
    ],
  },
  {
    label: "Risk & Alerts",
    items: [
      { href: "/app/alerts", label: "Alerts" },
      { href: "/app/risk-controls", label: "Risk Controls" },
    ],
  },
  {
    label: "Account",
    items: [
      { href: "/app/broker-connections", label: "Broker Connections" },
      { href: "/app/account", label: "Account / Settings" },
      { href: "/app/notifications", label: "Notifications" },
    ],
  },
];

export default function AppSidebar() {
  return (
    <aside className="hidden w-64 shrink-0 border-r border-black/5 bg-white md:block">
      <div className="flex h-16 items-center gap-2 border-b border-black/5 px-5">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/brand/icon-mark.svg" alt="MyAlgoAgent" width={28} height={28} />
          <span className="text-base font-bold text-brand-primary">MyAlgoAgent</span>
        </Link>
      </div>
      <nav className="space-y-6 p-4">
        {navGroups.map((group) => (
          <div key={group.label}>
            <p className="px-2 text-xs font-semibold uppercase tracking-wide text-brand-navy/40">
              {group.label}
            </p>
            <ul className="mt-2 space-y-1">
              {group.items.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="block rounded-lg px-2 py-2 text-sm font-medium text-brand-navy/70 hover:bg-brand-bg hover:text-brand-primary"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
