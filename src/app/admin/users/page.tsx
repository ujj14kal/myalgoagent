import Link from "next/link";
import type { Prisma, UserStatus } from "@prisma/client";
import { Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireStaff, ROLE_LABEL, isBuiltInOwner } from "@/lib/admin/access";
import { AdminPageHeader, Card, Empty, Pill, ago, ist } from "@/components/admin/ui";
import { avatarInitials } from "@/lib/avatar";
import { daysAgo } from "@/lib/admin/time";

const PAGE = 50;

const filters = (now: number): { key: string; label: string; where: Prisma.UserWhereInput }[] => [
  { key: "", label: "Everyone", where: {} },
  { key: "active7", label: "Active this week", where: { lastSeenAt: { gte: new Date(now - 7 * 86_400_000) } } },
  { key: "new", label: "New (30 days)", where: { createdAt: { gte: new Date(now - 30 * 86_400_000) } } },
  { key: "brokers", label: "Broker connected", where: { brokerConnections: { some: {} } } },
  { key: "SUSPENDED", label: "Suspended", where: { status: "SUSPENDED" as UserStatus } },
  { key: "PENDING_DELETION", label: "Pending deletion", where: { status: "PENDING_DELETION" as UserStatus } },
  { key: "staff", label: "Team", where: { adminRole: { not: null } } },
];

export default async function UsersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireStaff("users.view");
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 100);
  const FILTERS = filters(daysAgo(0).getTime());
  const filter = FILTERS.find((f) => f.key === (sp.status ?? "")) ?? FILTERS[0];
  const page = Math.max(1, Number(sp.page) || 1);
  const where: Prisma.UserWhereInput = {
    ...filter.where,
    ...(q ? { OR: [{ email: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }, { username: { contains: q, mode: "insensitive" } }, { id: q }] } : {}),
  };
  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE,
      take: PAGE,
      select: {
        id: true,
        name: true,
        email: true,
        username: true,
        image: true,
        status: true,
        adminRole: true,
        createdAt: true,
        lastSeenAt: true,
        _count: { select: { strategies: true, brokerConnections: true, paperSessions: { where: { status: "ACTIVE" } } } },
      },
    }),
  ]);
  const link = (patch: Record<string, string>) => `/admin/users?${new URLSearchParams({ ...(q ? { q } : {}), ...(filter.key ? { status: filter.key } : {}), ...patch })}`;

  return (
    <div className="space-y-5">
      <AdminPageHeader title="Users" icon={Users} description={`${total.toLocaleString("en-IN")} account${total === 1 ? "" : "s"}${q ? ` matching “${q}”` : ""}. Opening a profile is recorded in the audit log.`} />
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/admin/users?${new URLSearchParams({ ...(q ? { q } : {}), ...(f.key ? { status: f.key } : {}) })}`}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${f.key === filter.key ? "bg-brand-navy text-white ring-brand-navy" : "bg-white text-brand-navy/60 ring-black/[0.06] hover:text-brand-navy"}`}
          >
            {f.label}
          </Link>
        ))}
        <form action="/admin/users" className="ml-auto">
          {filter.key && <input type="hidden" name="status" value={filter.key} />}
          <input name="q" defaultValue={q} placeholder="Name, email, username or ID" className="w-64 rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-xs outline-none focus:border-brand-primary/40" />
        </form>
      </div>

      <Card pad={false}>
        {users.length === 0 ? (
          <Empty>No accounts match.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-black/[0.05] text-left text-[11px] font-semibold uppercase tracking-wider text-brand-navy/40">
                  <th className="px-5 py-3">Account</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Joined</th>
                  <th className="px-3 py-3">Last seen</th>
                  <th className="px-3 py-3 text-right">Strategies</th>
                  <th className="px-3 py-3 text-right">Live paper</th>
                  <th className="px-5 py-3 text-right">Brokers</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.04]">
                {users.map((u) => {
                  const role = isBuiltInOwner(u.email) ? "OWNER" : u.adminRole;
                  return (
                    <tr key={u.id} className="group hover:bg-brand-bg/70">
                      <td className="px-5 py-3">
                        <Link href={`/admin/users/${u.id}`} className="flex items-center gap-3">
                          {u.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={u.image} alt="" className="h-8 w-8 rounded-full object-cover" />
                          ) : (
                            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-brand-primary to-brand-primary-light text-[11px] font-semibold text-white">{avatarInitials(u.name, u.email)}</span>
                          )}
                          <span className="min-w-0">
                            <span className="block truncate font-semibold text-brand-navy group-hover:text-brand-primary">{u.name ?? u.username ?? "—"}</span>
                            <span className="block truncate text-xs text-brand-navy/45">{u.email}</span>
                          </span>
                          {role && <Pill tone="purple">{ROLE_LABEL[role]}</Pill>}
                        </Link>
                      </td>
                      <td className="px-3 py-3">
                        {u.status === "ACTIVE" ? <Pill tone="green" dot>active</Pill> : u.status === "SUSPENDED" ? <Pill tone="red" dot>suspended</Pill> : <Pill tone="gold" dot>deleting</Pill>}
                      </td>
                      <td className="px-3 py-3 text-xs text-brand-navy/60">{ist(u.createdAt, false)}</td>
                      <td className="px-3 py-3 text-xs text-brand-navy/60">{ago(u.lastSeenAt)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{u._count.strategies}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{u._count.paperSessions}</td>
                      <td className="px-5 py-3 text-right tabular-nums">{u._count.brokerConnections}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {total > PAGE && (
        <div className="flex items-center justify-between text-xs text-brand-navy/55">
          <span>
            {(page - 1) * PAGE + 1}–{Math.min(total, page * PAGE)} of {total}
          </span>
          <span className="flex gap-2">
            {page > 1 && <Link href={link({ page: String(page - 1) })} className="rounded-lg bg-white px-3 py-1.5 font-semibold ring-1 ring-black/[0.06]">← Newer</Link>}
            {page * PAGE < total && <Link href={link({ page: String(page + 1) })} className="rounded-lg bg-white px-3 py-1.5 font-semibold ring-1 ring-black/[0.06]">Older →</Link>}
          </span>
        </div>
      )}
    </div>
  );
}
