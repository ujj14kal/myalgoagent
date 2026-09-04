import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import KillSwitchToggle from "@/components/kill-switch-toggle";
import RiskSettingsForm from "@/components/risk-settings-form";

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
      <h1 className="text-2xl font-bold text-brand-navy">Risk Controls</h1>
      <p className="mt-2 text-sm text-brand-navy/60">
        Server-enforced limits on your paper trading. These apply
        regardless of what the strategy builder UI allows — a signal that
        would open a new position is blocked here first.
      </p>

      <div className="mt-6">
        <KillSwitchToggle enabled={riskSettings?.killSwitchEnabled ?? false} />
      </div>

      <div className="mt-6">
        <RiskSettingsForm
          killSwitchEnabled={riskSettings?.killSwitchEnabled ?? false}
          initialMaxLossPercent={riskSettings?.maxLossPercent ?? null}
          initialMaxConsecutiveLosses={riskSettings?.maxConsecutiveLosses ?? null}
        />
      </div>

      <div className="mt-8">
        <p className="mb-2 text-sm font-semibold text-brand-navy">Risk event log</p>
        <div className="overflow-x-auto rounded-2xl border border-black/5 bg-white">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-black/5 text-xs font-semibold uppercase tracking-wide text-brand-navy/40">
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Event</th>
                <th className="px-4 py-3">Details</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="border-b border-black/5 last:border-0">
                  <td className="px-4 py-2 whitespace-nowrap">{new Date(e.createdAt).toLocaleString("en-IN")}</td>
                  <td className="px-4 py-2 font-medium text-brand-sell">{EVENT_LABEL[e.type] ?? e.type}</td>
                  <td className="px-4 py-2 text-brand-navy/70">
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
                  <td colSpan={3} className="px-4 py-8 text-center text-sm text-brand-navy/50">
                    No risk events yet.
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
