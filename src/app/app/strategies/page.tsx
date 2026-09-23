import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import EmptyState from "@/components/empty-state";
import StrategyBoardColumn, { StrategyRowCard, type StrategyCard } from "@/components/strategy-board-column";

export const metadata = { title: "Strategies", robots: { index: false } };

export default async function StrategiesPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const strategies = await prisma.strategy.findMany({
    where: { userId: session.user.id },
    include: { instrument: true },
    orderBy: { updatedAt: "desc" },
  });

  const byStatus = new Map<string, StrategyCard[]>();
  for (const s of strategies) {
    const list = byStatus.get(s.status) ?? [];
    list.push(s);
    byStatus.set(s.status, list);
  }
  const archived = byStatus.get("ARCHIVED") ?? [];

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-navy">Strategies</h1>
          <p className="mt-2 text-sm text-brand-navy/60">
            Build rule-based strategies visually or with code, and preview
            exactly where they would have signalled on real historical data.
            Draft and Active are set automatically — a strategy becomes
            Active the moment you actually put it to work in paper trading.
          </p>
        </div>
        <Link
          href="/app/strategies/new"
          className="shrink-0 rounded-full bg-brand-primary px-5 py-2 text-sm font-medium text-white hover:bg-brand-primary-light"
        >
          New Strategy
        </Link>
      </div>

      {strategies.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            pose="point"
            title="You haven't built any strategies yet."
            description="Compose entry/exit rules visually or with code, then backtest against real historical data before risking anything."
            ctaLabel="Create your first strategy"
            ctaHref="/app/strategies/new"
          />
        </div>
      ) : (
        <div className="mt-8 flex flex-col gap-4 lg:flex-row lg:items-start">
          <StrategyBoardColumn
            title="Active"
            description="In real use — running in paper or live trading."
            strategies={byStatus.get("ACTIVE") ?? []}
            accent="bg-brand-buy/5"
            emptyLabel="Nothing active yet — put a draft to work in paper trading."
          />
          <StrategyBoardColumn
            title="Drafts"
            description="Built but never put to work yet."
            strategies={byStatus.get("DRAFT") ?? []}
            accent="bg-brand-navy/5"
            addHref="/app/strategies/new"
            emptyLabel="No drafts — start one below."
          />
          <StrategyBoardColumn
            title="Deleted"
            description="Restore or delete forever — nothing here is gone yet."
            strategies={byStatus.get("DELETED") ?? []}
            accent="bg-brand-sell/5"
            emptyLabel="Nothing here"
          />
        </div>
      )}

      {archived.length > 0 && (
        <div className="mt-8">
          <div className="flex items-baseline gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-navy/50">Archived</h2>
            <span className="text-xs text-brand-navy/30">{archived.length}</span>
          </div>
          <p className="mt-0.5 text-xs text-brand-navy/40">Sidelined on purpose — fully intact, restore anytime.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {archived.map((s) => (
              <StrategyRowCard key={s.id} s={s} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
