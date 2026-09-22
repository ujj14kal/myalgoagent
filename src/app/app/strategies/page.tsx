import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import EmptyState from "@/components/empty-state";

export const metadata = { title: "Strategies", robots: { index: false } };

const STATUS_DOT: Record<string, string> = {
  ACTIVE: "bg-brand-buy",
  DRAFT: "bg-brand-navy/40",
  ARCHIVED: "bg-brand-navy/30",
  DELETED: "bg-brand-sell",
};

type StrategyCard = {
  id: string;
  name: string;
  status: string;
  mode: string;
  instrument: { symbol: string };
};

function StrategyRowCard({ s }: { s: StrategyCard }) {
  return (
    <Link
      href={`/app/strategies/${s.id}`}
      className="hover-lift block rounded-xl border border-black/5 bg-white p-4 hover:border-brand-primary"
    >
      <div className="flex items-start gap-2">
        <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[s.status]}`} />
        <p className="text-sm font-semibold leading-tight text-brand-navy">{s.name}</p>
      </div>
      <p className="mt-1.5 pl-4 text-xs text-brand-navy/60">{s.instrument.symbol}</p>
      <p className="mt-2 pl-4 text-xs font-medium text-brand-navy/40">
        {s.mode === "NO_CODE" ? "Built visually" : "Built with code"}
      </p>
    </Link>
  );
}

function KanbanColumn({
  title,
  description,
  strategies,
  accent,
}: {
  title: string;
  description: string;
  strategies: StrategyCard[];
  accent: string;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col rounded-2xl border border-black/5 bg-brand-bg/40">
      <div className={`rounded-t-2xl border-b border-black/5 px-4 py-3 ${accent}`}>
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-brand-navy">{title}</h2>
          <span className="rounded-full bg-white/70 px-2 py-0.5 text-xs font-semibold text-brand-navy/60">
            {strategies.length}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-brand-navy/50">{description}</p>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        {strategies.length === 0 ? (
          <p className="rounded-xl border border-dashed border-black/10 px-3 py-6 text-center text-xs text-brand-navy/30">
            Nothing here
          </p>
        ) : (
          strategies.map((s) => <StrategyRowCard key={s.id} s={s} />)
        )}
      </div>
    </div>
  );
}

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
          <KanbanColumn
            title="Active"
            description="In real use — running in paper or live trading."
            strategies={byStatus.get("ACTIVE") ?? []}
            accent="bg-brand-buy/5"
          />
          <KanbanColumn
            title="Drafts"
            description="Built but never put to work yet."
            strategies={byStatus.get("DRAFT") ?? []}
            accent="bg-brand-navy/5"
          />
          <KanbanColumn
            title="Deleted"
            description="Restore or delete forever — nothing here is gone yet."
            strategies={byStatus.get("DELETED") ?? []}
            accent="bg-brand-sell/5"
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
