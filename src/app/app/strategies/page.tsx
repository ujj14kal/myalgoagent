import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Strategies", robots: { index: false } };

const STATUS_STYLE: Record<string, string> = {
  ACTIVE: "bg-brand-buy/10 text-brand-buy",
  DRAFT: "bg-brand-navy/10 text-brand-navy/60",
  ARCHIVED: "bg-brand-sell/10 text-brand-sell",
};

export default async function StrategiesPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const strategies = await prisma.strategy.findMany({
    where: { userId: session.user.id },
    include: { instrument: true },
    orderBy: { updatedAt: "desc" },
  });

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

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {strategies.map((s) => (
          <Link
            key={s.id}
            href={`/app/strategies/${s.id}`}
            className="rounded-2xl border border-black/5 bg-white p-5 hover:border-brand-primary"
          >
            <div className="flex items-start justify-between">
              <p className="text-sm font-semibold text-brand-navy">{s.name}</p>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[s.status]}`}>
                {s.status}
              </span>
            </div>
            <p className="mt-1 text-xs text-brand-navy/60">{s.instrument.symbol}</p>
            <p className="mt-3 text-xs font-medium text-brand-navy/40">
              {s.mode === "NO_CODE" ? "Built visually" : "Built with code"}
            </p>
          </Link>
        ))}

        {strategies.length === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed border-brand-navy/15 p-10 text-center">
            <p className="text-sm text-brand-navy/50">
              You haven&rsquo;t built any strategies yet.
            </p>
            <Link href="/app/strategies/new" className="mt-3 inline-block text-sm font-medium text-brand-primary hover:underline">
              Create your first strategy →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
