import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { ScrollText } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/admin/access";
import { AdminPageHeader, Card, Empty, Pill, ist } from "@/components/admin/ui";

const PAGE = 100;

const AREA: Record<string, { label: string; tone: "purple" | "red" | "blue" | "gold" | "green" | "gray" }> = {
  user: { label: "Users", tone: "blue" },
  case: { label: "Support", tone: "purple" },
  feedback: { label: "Feedback", tone: "gold" },
  team: { label: "Team", tone: "red" },
  announcement: { label: "Announcements", tone: "green" },
  job: { label: "Jobs", tone: "gray" },
  system: { label: "System", tone: "gray" },
};

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireStaff("audit");
  const sp = await searchParams;
  const area = sp.area && AREA[sp.area] ? sp.area : "";
  const views = sp.views === "1";
  const page = Math.max(1, Number(sp.page) || 1);
  const where: Prisma.AdminAuditLogWhereInput = {
    ...(area ? { action: { startsWith: `${area}.` } } : {}),
    ...(views ? {} : { NOT: { action: "user.view" } }),
    ...(sp.actor ? { actorEmail: sp.actor } : {}),
  };
  const [rows, total] = await Promise.all([prisma.adminAuditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE }), prisma.adminAuditLog.count({ where })]);
  const q = (patch: Record<string, string>) => `/admin/audit?${new URLSearchParams({ ...(area ? { area } : {}), ...(views ? { views: "1" } : {}), ...patch })}`;

  return (
    <div className="space-y-5">
      <AdminPageHeader title="Audit log" icon={ScrollText} description="Every change made in the admin portal — and, when shown, every time a staff member opened a user's profile. Entries can't be edited or deleted from here." />
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/admin/audit${views ? "?views=1" : ""}`} className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${!area ? "bg-brand-navy text-white ring-brand-navy" : "bg-white text-brand-navy/60 ring-black/[0.06]"}`}>
          Everything
        </Link>
        {Object.entries(AREA).map(([k, v]) => (
          <Link key={k} href={`/admin/audit?${new URLSearchParams({ area: k, ...(views ? { views: "1" } : {}) })}`} className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${area === k ? "bg-brand-navy text-white ring-brand-navy" : "bg-white text-brand-navy/60 ring-black/[0.06]"}`}>
            {v.label}
          </Link>
        ))}
        <Link href={q({ views: views ? "" : "1" }).replace("views=&", "").replace(/[?&]views=$/, "")} className={`ml-auto rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${views ? "bg-brand-gold/20 text-[#6f5a22] ring-brand-gold/40" : "bg-white text-brand-navy/60 ring-black/[0.06]"}`}>
          {views ? "Showing profile views" : "Show profile views"}
        </Link>
      </div>
      <Card pad={false}>
        {rows.length === 0 ? (
          <Empty>Nothing recorded yet.</Empty>
        ) : (
          <ul className="divide-y divide-black/[0.04]">
            {rows.map((r) => {
              const a = AREA[r.action.split(".")[0]] ?? { label: r.action.split(".")[0], tone: "gray" as const };
              const target = r.targetType === "user" && r.targetId ? `/admin/users/${r.targetId}` : (r.targetType === "case" || r.targetType === "feedback") && r.targetId ? `/admin/inbox/${r.targetType}/${r.targetId}` : null;
              return (
                <li key={r.id} className="grid grid-cols-[auto_1fr_auto] items-start gap-3 px-5 py-3">
                  <Pill tone={a.tone}>{a.label}</Pill>
                  <div className="min-w-0">
                    <p className="text-sm text-brand-navy">
                      {target ? (
                        <Link href={target} className="hover:text-brand-primary">
                          {r.summary ?? r.action}
                        </Link>
                      ) : (
                        (r.summary ?? r.action)
                      )}
                    </p>
                    <p className="text-[11px] text-brand-navy/45">
                      <Link href={q({ actor: r.actorEmail })} className="hover:text-brand-primary">
                        {r.actorEmail}
                      </Link>{" "}
                      · <span className="font-mono">{r.action}</span>
                      {r.ip && ` · ${r.ip}`}
                    </p>
                    {r.meta && <p className="mt-0.5 truncate font-mono text-[10.5px] text-brand-navy/40">{JSON.stringify(r.meta)}</p>}
                  </div>
                  <span className="text-[11px] text-brand-navy/40">{ist(r.createdAt)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      {total > PAGE && (
        <div className="flex justify-between text-xs text-brand-navy/55">
          <span>{total.toLocaleString("en-IN")} entries</span>
          <span className="flex gap-2">
            {page > 1 && <Link href={q({ page: String(page - 1) })} className="rounded-lg bg-white px-3 py-1.5 font-semibold ring-1 ring-black/[0.06]">← Newer</Link>}
            {page * PAGE < total && <Link href={q({ page: String(page + 1) })} className="rounded-lg bg-white px-3 py-1.5 font-semibold ring-1 ring-black/[0.06]">Older →</Link>}
          </span>
        </div>
      )}
    </div>
  );
}
