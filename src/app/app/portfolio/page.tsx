import Link from "next/link";
import { Banknote, BriefcaseBusiness, Landmark, ListOrdered, PieChart, Wallet } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import EmptyState from "@/components/empty-state";
import PageHeader from "@/components/ui/page-header";
import StatCard from "@/components/ui/stat-card";
import { readableBrokers } from "@/lib/brokers/connected";
import { loadBrokerAccount } from "@/lib/brokers/account-load";
import { checkRateLimit } from "@/lib/rate-limit";
import { daysAgo } from "@/lib/admin/time";
import { formatINR, formatSignedINR, toneOf } from "@/lib/format";

export const metadata = { title: "Portfolio", robots: { index: false } };
export const dynamic = "force-dynamic";

// Your real portfolio, as your connected brokers report it. Forward tests are
// hypothetical and stay inside each forward test — they're never pooled into
// an account here.

export default async function PortfolioPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  const brokers = await readableBrokers(userId);
  const limited = brokers.length ? await checkRateLimit(`portfolio:${userId}`, 20, 60_000) : null;
  const accounts = limited ? [] : await Promise.all(brokers.map((b) => loadBrokerAccount(userId, b.id)));
  const liveOrders = await prisma.liveOrder.count({ where: { userId, createdAt: { gte: daysAgo(1) } } });

  return (
    <div className="space-y-6">
      <PageHeader title="Portfolio" icon={Wallet} description="Your real holdings, positions and funds, read from your connected brokers. Forward-test results are hypothetical and stay inside each forward test." />
      {brokers.length === 0 ? (
        <EmptyState pose="idle" title="No broker connected for today." description="Connect a broker (or log in for today) to see your real portfolio here." ctaLabel="Broker Connections" ctaHref="/app/broker-connections" />
      ) : limited ? (
        <p className="surface p-5 text-sm text-brand-sell">Refreshing too often — wait a moment.</p>
      ) : (
        accounts.map((acct, i) => {
          if ("error" in acct) return <p key={i} className="surface p-5 text-sm text-brand-sell">{brokers[i].name}: {acct.error}</p>;
          const holdings = acct.holdings?.ok ? acct.holdings.data : [];
          const positions = acct.positions?.ok ? acct.positions.data : [];
          const value = holdings.reduce((s, h) => s + (h.ltp ?? h.avgPrice ?? 0) * h.quantity, 0);
          const pnl = holdings.reduce((s, h) => s + (h.pnl ?? (h.ltp != null && h.avgPrice != null ? (h.ltp - h.avgPrice) * h.quantity : 0)), 0);
          const funds = acct.funds?.ok ? acct.funds.data : null;
          return (
            <section key={acct.broker} className="space-y-3">
              <p className="flex items-center gap-2 text-sm font-semibold text-brand-navy">
                <Landmark size={15} className="text-brand-primary" /> {acct.name}
                <Link href={`/app/broker-account?broker=${acct.broker}`} className="ml-auto text-xs font-semibold text-brand-primary hover:underline">
                  Full account →
                </Link>
              </p>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard label="Available funds" value={funds?.available == null ? "—" : formatINR(funds.available)} icon={Banknote} />
                <StatCard label="Holdings value" value={formatINR(value)} icon={PieChart} sub={`${holdings.length} holding${holdings.length === 1 ? "" : "s"}`} />
                <StatCard label="Holdings P&L" value={formatSignedINR(pnl)} tone={toneOf(pnl)} icon={Wallet} sub="Unrealised, as reported" />
                <StatCard label="Open positions" value={String(positions.filter((p) => p.quantity !== 0).length)} icon={BriefcaseBusiness} sub="Today" />
              </div>
              {!acct.holdings?.ok && acct.holdings && <p className="text-xs text-brand-sell">Holdings: {acct.holdings.error}</p>}
            </section>
          );
        })
      )}
      <p className="flex items-center gap-2 text-sm text-brand-navy/60">
        <ListOrdered size={14} /> {liveOrders} live order{liveOrders === 1 ? "" : "s"} placed through MyAlgoAgent in the last 24 hours ·{" "}
        <Link href="/app/orders" className="font-semibold text-brand-primary hover:underline">
          Orders
        </Link>{" "}
        ·{" "}
        <Link href="/app/forward-testing" className="font-semibold text-brand-primary hover:underline">
          Forward tests (hypothetical)
        </Link>
      </p>
      <p className="text-xs text-brand-navy/40">Read-only, as your broker reports it right now. Your broker&apos;s app is the final record.</p>
    </div>
  );
}
