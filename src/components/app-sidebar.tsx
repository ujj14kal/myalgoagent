"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import FeedbackWidget from "@/components/feedback-widget";

export const navGroups = [
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
      { href: "/app/agent-settings", label: "Agent Settings" },
      { href: "/app/notifications", label: "Notifications" },
    ],
  },
];

export default function AppSidebar() {
  const pathname = usePathname();

  return (
    // sticky + h-screen (not the static-flow default) keeps the nav pinned
    // in the viewport as the user scrolls a long page — without this, the
    // aside stretches to match the full page height (correct flex
    // behavior) but its own nav content doesn't fill that height, leaving
    // a large blank white column below the last nav item, and the nav
    // itself scrolls out of view with the rest of the page instead of
    // staying reachable. overflow-y-auto is a defensive addition in case
    // the nav list itself ever grows taller than the viewport.
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col overflow-y-auto border-r border-black/5 bg-white md:flex">
      <div className="flex h-16 shrink-0 items-center gap-2 border-b border-black/5 px-5">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/brand/icon-mark.png" alt="MyAlgoAgent" width={28} height={28} />
          <span className="text-base font-bold text-brand-primary">MyAlgoAgent</span>
        </Link>
      </div>
      <nav className="flex-1 space-y-6 p-4" data-tour="sidebar-nav">
        {navGroups.map((group) => (
          <div key={group.label}>
            <p className="px-2 text-xs font-semibold uppercase tracking-wide text-brand-navy/40">
              {group.label}
            </p>
            <ul className="mt-2 space-y-1">
              {group.items.map((item) => {
                const active = pathname === item.href || pathname?.startsWith(item.href + "/");
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`relative block rounded-lg px-2 py-2 text-sm font-medium transition-colors ${
                        active
                          ? "bg-brand-primary/10 text-brand-primary"
                          : "text-brand-navy/70 hover:bg-brand-bg hover:text-brand-primary"
                      }`}
                    >
                      {active && (
                        <span className="absolute -left-4 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-brand-gold" />
                      )}
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="shrink-0 border-t border-black/5 p-4">
        <FeedbackWidget />
      </div>
    </aside>
  );
}
