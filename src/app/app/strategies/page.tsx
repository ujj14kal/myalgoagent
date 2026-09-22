import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import EmptyState from "@/components/empty-state";

export const metadata = { title: "Strategies", robots: { index: false } };

const STATUS_STYLE: Record<string, string> = {
  ACTIVE: "bg-brand-buy/10 text-brand-buy",
  DRAFT: "bg-brand-navy/10 text-brand-navy/60",
  ARCHIVED: "bg-brand-sell/10 text-brand-sell",
  DELETED: "bg-brand-sell/10 text-brand-sell",
};

type StrategyCard = {
  id: string;
  name: string;
  status: string;
  mode: string;
  instrument: { symbol: string };
};

function StrategyGrid({ strategies }: { strategies: StrategyCard[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {strategies.map((s) => (
        <Link
          key={s.id}
          href={`/app/strategies/${s.id}`}
          className="hover-lift rounded-2xl border border-black/5 bg-white p-5 hover:border-brand-primary"
        >
          <div className="flex items-start justify-between">
            <p className="text-sm font-semibold text-brand-navy">{s.name}</p>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[s.status]}`}>{s.status}</span>
          </div>
          <p className="mt-1 text-xs text-brand-navy/60">{s.instrument.symbol}</p>
          <p className="mt-3 text-xs font-medium text-brand-navy/40">
            {s.mode === "NO_CODE" ? "Built visually" : "Built with code"}
          </p>
        </Link>
      ))}
    </div>
  );
}

// Rendered as separate sections/"columns" rather than one flat list — Draft
// and Active are both fully automatic (see activateStrategyIfDraft), so
// grouping them visually is what actually makes that automatic state useful
// to see at a glance, rather than a status chip buried in a mixed grid.
const SECTIONS: { status: "ACTIVE" | "DRAFT" | "ARCHIVED" | "DELETED"; title: string; description: string }[] = [
  { status: "ACTIVE", title: "Active", description: "In real use — currently running in paper or live trading." },
  { status: "DRAFT", title: "Drafts", description: "Built but never put to work yet." },
  { status: "ARCHIVED", title: "Archived", description: "Sidelined on purpose — fully intact, restore anytime." },
  { status: "DELETED", title: "Deleted", description: "Restore or delete forever — nothing here is gone yet." },
];

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

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-navy">Strategies</h1>
          <p className="mt-2 text-sm text-brand-navy/60">
            Build rule-based strategies visually or with code, and preview
            exactly where they would have signalled on real historical data.
          </p>
        </div>
        <Link
          href="/app/strategies/new"
          className="rounded-full bg-brand-primary px-5 py-2 text-sm font-medium text-white hover:bg-brand-primary-light"
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
        <div className="mt-8 space-y-10">
          {SECTIONS.map(({ status, title, description }) => {
            const list = byStatus.get(status);
            if (!list || list.length === 0) return null;
            return (
              <div key={status}>
                <div className="flex items-baseline gap-2">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-navy/50">{title}</h2>
                  <span className="text-xs text-brand-navy/30">{list.length}</span>
                </div>
                <p className="mt-0.5 text-xs text-brand-navy/40">{description}</p>
                <div className="mt-3">
                  <StrategyGrid strategies={list} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
