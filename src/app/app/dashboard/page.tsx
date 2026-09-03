import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Dashboard", robots: { index: false } };

export default async function DashboardPage() {
  const session = await auth();
  const activeStrategies = session?.user?.id
    ? await prisma.strategy.count({ where: { userId: session.user.id, status: "ACTIVE" } })
    : 0;

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-navy">
        Welcome, {session?.user?.name ?? session?.user?.email}
      </h1>
      <p className="mt-2 text-sm text-brand-navy/60">
        Signed in as {session?.user?.email}. Your account is set up — the
        trading dashboard (portfolio, strategies, live signals) is the next
        thing being built here.
      </p>
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-black/5 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-navy/40">
            Active strategies
          </p>
          <p className="mt-2 text-2xl font-bold text-brand-navy">{activeStrategies}</p>
        </div>
        <div className="rounded-2xl border border-black/5 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-navy/40">
            Paper P&amp;L (today)
          </p>
          <p className="mt-2 text-2xl font-bold text-brand-navy">$0.00</p>
        </div>
        <div className="rounded-2xl border border-black/5 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-navy/40">
            Broker connections
          </p>
          <p className="mt-2 text-2xl font-bold text-brand-navy">0</p>
        </div>
      </div>
    </div>
  );
}
