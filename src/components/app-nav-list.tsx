"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { navGroups, isActive } from "@/lib/app-nav";

/** The app's navigation, shared by the desktop sidebar and the mobile drawer. */
export default function AppNavList({ layoutId, onNavigate }: { layoutId: string; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="space-y-6" data-tour="sidebar-nav" aria-label="App">
      {navGroups.map((group) => (
        <div key={group.label}>
          <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">{group.label}</p>
          <ul className="mt-2 space-y-0.5">
            {group.items.map((item) => {
              const active = isActive(pathname, item.href);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={`group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                      active ? "text-white" : "text-white/60 hover:bg-white/[0.06] hover:text-white"
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId={layoutId}
                        className="absolute inset-0 rounded-xl bg-white/[0.12] ring-1 ring-white/10"
                        transition={{ type: "spring", stiffness: 420, damping: 34 }}
                      >
                        <span className="absolute -left-3 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-brand-gold" />
                      </motion.span>
                    )}
                    <Icon
                      size={17}
                      strokeWidth={2}
                      className={`relative shrink-0 transition-colors ${active ? "text-brand-gold-light" : "text-white/45 group-hover:text-white/80"}`}
                    />
                    <span className="relative truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
