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

export default async function RiskControlsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const [riskSettings, events] = await Promise.all([
    prisma.riskSettings.findUnique({ where: { userId: session.user.id } }),
    prisma.riskEvent.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  return (
    <div>
      <PageHeader title="Risk Controls" icon={ShieldCheck} description={<>Server-enforced limits on your paper trading. These apply regardless of what the strategy builder UI allows — a signal that would open a new position is blocked here first.</>} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <KillSwitchToggle enabled={riskSettings?.killSwitchEnabled ?? false} />
          <RiskSettingsForm
            killSwitchEnabled={riskSettings?.killSwitchEnabled ?? false}
            initialMaxLossPercent={riskSettings?.maxLossPercent ?? null}
            initialMaxConsecutiveLosses={riskSettings?.maxConsecutiveLosses ?? null}
          />
        </div>
        <aside className="surface flex flex-col items-center p-6 text-center">
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
          <span className="rounded-full bg-brand-navy/[0.06] px-2 py-0.5 text-xs font-semibold text-brand-navy/55">{events.length}</span>
        </div>
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
                      <Link href={`/app/paper-trading/${e.paperSessionId}`} className="text-brand-primary hover:underline">
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
                    No risk events yet — nothing has been blocked.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
