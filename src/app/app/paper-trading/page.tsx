import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PaperSessionForm from "@/components/paper-session-form";

export const metadata = { title: "Paper Trading", robots: { index: false } };

const STATUS_STYLE: Record<string, string> = {
  ACTIVE: "bg-brand-buy/10 text-brand-buy",
  PAUSED: "bg-brand-navy/10 text-brand-navy/60",
  STOPPED: "bg-brand-sell/10 text-brand-sell",
};

export default async function PaperTradingPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const [strategies, sessions] = await Promise.all([
    prisma.strategy.findMany({
      where: { userId: session.user.id },
      include: { instrument: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.paperSession.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-navy">Paper Trading</h1>
      <p className="mt-2 text-sm text-brand-navy/60">
        Run a strategy forward with virtual capital. This uses end-of-day
        data and updates when you click <strong>Sync now</strong> — it is
        not a continuous real-time simulation.
      </p>

      <div className="mt-6">
        <PaperSessionForm
          strategies={strategies.map((s) => ({ id: s.id, name: s.name, instrumentSymbol: s.instrument.symbol }))}
        />
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sessions.map((s) => {
          const inPosition = s.positionQuantity !== null;
          const equity = s.cash + (inPosition ? (s.positionEntryPrice ?? 0) * (s.positionQuantity ?? 0) : 0);
          const pnlPct = ((equity - s.startingCapital) / s.startingCapital) * 100;
          return (
            <Link
              key={s.id}
              href={`/app/paper-trading/${s.id}`}
              className="rounded-2xl border border-black/5 bg-white p-5 hover:border-brand-primary"
            >
              <div className="flex items-start justify-between">
                <p className="text-sm font-semibold text-brand-navy">{s.strategyName}</p>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[s.status]}`}>
                  {s.status}
                </span>
              </div>
              <p className="mt-1 text-xs text-brand-navy/60">{s.instrumentSymbol}</p>
              <p className={`mt-3 text-xl font-bold ${pnlPct >= 0 ? "text-brand-buy" : "text-brand-sell"}`}>
                {pnlPct >= 0 ? "+" : ""}
                {pnlPct.toFixed(2)}%
              </p>
              <p className="mt-1 text-xs text-brand-navy/40">
                {inPosition ? "In position" : "Flat"} · last synced{" "}
                {s.lastSyncedTime ? new Date(s.lastSyncedTime * 1000).toLocaleDateString("en-IN") : "never"}
              </p>
            </Link>
          );
        })}

        {sessions.length === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed border-brand-navy/15 p-10 text-center">
            <p className="text-sm text-brand-navy/50">No paper trading sessions yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
