import type { Prisma } from "@prisma/client";
import Pager from "@/components/ui/pager";
import ListToolbar from "@/components/ui/list-toolbar";
import { pageWindow, readPageQuery } from "@/lib/pagination";
import { keepParams, qEnum, qText } from "@/lib/list-query";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import KillSwitchToggle from "@/components/kill-switch-toggle";
import RiskSettingsForm from "@/components/risk-settings-form";
import { ScrollText, ShieldCheck } from "lucide-react";
import Agent2D from "@/components/robot/agent-2d";
import PageHeader from "@/components/ui/page-header";

export const metadata = { title: "Risk Controls", robots: { index: false } };

const EVENT_LABEL: Record<string, string> = {
  KILL_SWITCH_BLOCKED: "Kill switch blocked entry",
  MAX_LOSS_HIT: "Max loss limit hit",
  MAX_CONSECUTIVE_LOSSES_HIT: "Max consecutive losses hit",
};

export default async function RiskControlsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await auth();
  if (!session?.user?.id) return null;
  const sp = await searchParams;
  const q = qText(sp.q);
  const type = qEnum(sp.type, ["all", ...Object.keys(EVENT_LABEL)] as const, "all");
  const where: Prisma.RiskEventWhereInput = { userId: session.user.id, ...(q ? { message: { contains: q, mode: "insensitive" } } : {}), ...(type !== "all" ? { type: type as Prisma.RiskEventWhereInput["type"] } : {}) };
  const [total, matching] = await Promise.all([prisma.riskEvent.count({ where: { userId: session.user.id } }), prisma.riskEvent.count({ where })]);
  const { page, size } = readPageQuery(sp);
  const win = pageWindow(matching, page, size);
  const params = keepParams({ q, type: type === "all" ? undefined : type, size: size === 25 ? undefined : String(size) });

  const [riskSettings, events] = await Promise.all([
    prisma.riskSettings.findUnique({ where: { userId: session.user.id } }),
    prisma.riskEvent.findMany({ where, orderBy: { createdAt: "desc" }, skip: win.skip, take: win.take }),
  ]);

  return (
    <div>
      <PageHeader title="Risk Controls" icon={ShieldCheck} description={<>Server-enforced limits on your forward testing. These apply regardless of what the strategy builder UI allows — a signal that would open a new position is blocked here first.</>} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <KillSwitchToggle enabled={riskSettings?.killSwitchEnabled ?? false} />
          <RiskSettingsForm
            killSwitchEnabled={riskSettings?.killSwitchEnabled ?? false}
            initialMaxLossPercent={riskSettings?.maxLossPercent ?? null}
            initialMaxConsecutiveLosses={riskSettings?.maxConsecutiveLosses ?? null}
            initialLiveMaxOrderValue={riskSettings?.liveMaxOrderValue ?? null}
            initialLiveMaxOrdersPerDay={riskSettings?.liveMaxOrdersPerDay ?? null}
          />
        </div>
        {/* Its own height (not stretched to the forms beside it), and it stays in view while they scroll. */}
        <aside className="surface flex flex-col items-center self-start p-6 text-center lg:sticky lg:top-6">
          <Agent2D pose={riskSettings?.killSwitchEnabled ? "alert" : "guarding"} size={120} />
          <p className="mt-2 text-sm font-semibold text-brand-navy">
            {riskSettings?.killSwitchEnabled ? "Trading is halted" : "Your limits are enforced server-side"}
          </p>
          <ul className="mt-3 space-y-2 text-left text-xs text-brand-navy/60">
            <li className="flex gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-primary/50" />Checked before every new position — not just in the browser.</li>
            <li className="flex gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-primary/50" />A session that crosses a limit is stopped automatically.</li>
            <li className="flex gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-primary/50" />Every block is recorded in the event log below.</li>
          </ul>
        </aside>
      </div>

      <div className="mt-8">
        <div className="mb-3 flex items-center gap-2">
          <ScrollText size={16} className="text-brand-primary" />
          <h2 className="text-sm font-semibold text-brand-navy">Risk event log</h2>
          <span className="rounded-full bg-brand-navy/[0.06] px-2 py-0.5 text-xs font-semibold text-brand-navy/55">{total}</span>
        </div>
        {total > 0 && (
          <div className="mb-3">
            <ListToolbar
              params={params}
              search={{ placeholder: "Search the log…" }}
              selects={[{ name: "type", label: "Event", options: [{ value: "all", label: "Any" }, ...Object.entries(EVENT_LABEL).map(([value, label]) => ({ value, label }))] }]}
            />
          </div>
        )}
        <div className="overflow-x-auto surface">
          <table className="data-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Event</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td className="text-brand-navy/70">{new Date(e.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })}</td>
                  <td className="font-semibold text-brand-sell">{EVENT_LABEL[e.type] ?? e.type}</td>
                  <td className="whitespace-normal text-brand-navy/70">
                    {e.paperSessionId ? (
                      <Link href={`/app/forward-testing/${e.paperSessionId}`} className="text-brand-primary hover:underline">
                        {e.message}
                      </Link>
                    ) : (
                      e.message
                    )}
                  </td>
                </tr>
              ))}
              {events.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-10 text-center text-sm text-brand-navy/50">
                    {total === 0 ? "No risk events yet — nothing has been blocked." : "No events match."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pager basePath="/app/risk-controls" params={params} window={win} />
      </div>
    </div>
  );
}
