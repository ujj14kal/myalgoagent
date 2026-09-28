"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, ArrowLeft, Bot, Inbox, LayoutDashboard, Megaphone, ScrollText, Server, ShieldCheck, Users } from "lucide-react";

const ICONS = { overview: LayoutDashboard, inbox: Inbox, users: Users, announcements: Megaphone, trading: Activity, ai: Bot, system: Server, audit: ScrollText, team: ShieldCheck };
export type AdminNavItem = { key: keyof typeof ICONS; href: string; label: string; badge?: number; alert?: boolean };

export default function AdminNav({ items }: { items: AdminNavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5">
      {items.map((it) => {
        const Icon = ICONS[it.key];
        const active = it.href === "/admin" ? pathname === "/admin" : pathname?.startsWith(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            className={`group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
              active ? "bg-white/[0.12] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]" : "text-white/60 hover:bg-white/[0.06] hover:text-white"
            }`}
          >
            <Icon size={17} className={active ? "text-brand-gold-light" : "text-white/45 group-hover:text-white/80"} />
            <span className="flex-1">{it.label}</span>
            {!!it.badge && <span className="rounded-full bg-brand-gold px-1.5 py-px text-[10px] font-bold text-brand-navy">{it.badge > 99 ? "99+" : it.badge}</span>}
            {it.alert && <span className="h-2 w-2 animate-pulse rounded-full bg-brand-sell ring-2 ring-brand-sell/30" />}
          </Link>
        );
      })}
      <Link href="/app/dashboard" className="mt-4 flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-white/45 hover:bg-white/[0.06] hover:text-white">
        <ArrowLeft size={17} />
        Back to the app
      </Link>
    </nav>
  );
}
