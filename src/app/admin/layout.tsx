import type { Metadata } from "next";
import { ShieldHalf } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { can, currentStaff, requireStaff, ROLE_LABEL } from "@/lib/admin/access";
import AdminNav, { type AdminNavItem } from "@/components/admin/admin-nav";
import QuickSearch from "@/components/admin/quick-search";
import { daysAgo } from "@/lib/admin/time";

// Page titles stay generic, and non-staff see a plain "not found" title —
// the tab title mustn't reveal that the portal exists.
export async function generateMetadata(): Promise<Metadata> {
  const staff = await currentStaff();
  return { title: staff ? { absolute: "Admin · MyAlgoAgent" } : "Page not found", robots: { index: false, follow: false } };
}
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff("inbox");
  const [openCases, openFeedback, failedJobs] = await Promise.all([
    prisma.supportCase.count({ where: { status: "OPEN" } }),
    prisma.feedback.count({ where: { status: "OPEN" } }),
    prisma.jobRun.count({ where: { ok: false, job: { in: ["paper-sync", "purge-deleted-accounts"] }, startedAt: { gte: daysAgo(1) } } }),
  ]);

  const items: AdminNavItem[] = [
    { key: "overview", href: "/admin", label: "Overview" },
    { key: "inbox", href: "/admin/inbox", label: "Inbox", badge: openCases + openFeedback },
    { key: "users", href: "/admin/users", label: "Users" },
    ...(can(staff.role, "announcements") ? [{ key: "announcements" as const, href: "/admin/announcements", label: "Announcements" }] : []),
    { key: "trading", href: "/admin/trading", label: "Trading ops", alert: failedJobs > 0 },
    ...(can(staff.role, "ai") ? [{ key: "ai" as const, href: "/admin/ai", label: "AI agent" }] : []),
    ...(can(staff.role, "system") ? [{ key: "system" as const, href: "/admin/system", label: "System & AWS" }] : []),
    ...(can(staff.role, "audit") ? [{ key: "audit" as const, href: "/admin/audit", label: "Audit log" }] : []),
    ...(can(staff.role, "team") ? [{ key: "team" as const, href: "/admin/team", label: "Team" }] : []),
  ];

  return (
    <div className="flex min-h-screen bg-[#f3f5fa]">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-[radial-gradient(120%_60%_at_0%_0%,#2a1766_0%,#0e1b2d_55%)] px-4 py-5 lg:flex">
        <div className="mb-6 flex items-center gap-2.5 px-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-gold to-brand-gold-light text-brand-navy shadow-[0_6px_18px_-6px_rgba(189,163,96,0.7)]">
            <ShieldHalf size={18} />
          </span>
          <div className="leading-tight">
            <p className="text-sm font-bold text-white">MyAlgoAgent</p>
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-brand-gold-light/80">Mission control</p>
          </div>
        </div>
        <AdminNav items={items} />
        <div className="mt-auto rounded-xl bg-white/[0.06] px-3 py-2.5 text-xs text-white/60 ring-1 ring-white/[0.06]">
          <p className="truncate font-semibold text-white/90">{staff.name}</p>
          <p className="truncate">{staff.email}</p>
          <p className="mt-1 inline-flex rounded-full bg-brand-gold/20 px-2 py-px text-[10px] font-bold uppercase tracking-wide text-brand-gold-light">{ROLE_LABEL[staff.role]}</p>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-black/[0.05] bg-[#f3f5fa]/85 px-4 backdrop-blur-xl md:px-8">
          <details className="relative lg:hidden">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl bg-brand-navy px-3 py-2 text-xs font-semibold text-white">
              <ShieldHalf size={14} /> Menu
            </summary>
            <div className="absolute left-0 top-11 z-30 w-64 rounded-2xl bg-brand-navy p-3 shadow-2xl">
              <AdminNav items={items} />
            </div>
          </details>
          <QuickSearch />
          <span className="ml-auto hidden text-xs text-brand-navy/40 sm:block">Everything you do here is recorded in the audit log.</span>
        </header>
        <main className="mx-auto w-full max-w-[1400px] flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
