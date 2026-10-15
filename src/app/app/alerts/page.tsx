import { Siren } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/ui/page-header";
import AlertForm from "@/components/alerts/alert-form";
import AlertRowActions from "@/components/alerts/alert-row-actions";
import AutoPager from "@/components/ui/auto-pager";
import { describeAlert, MAX_ACTIVE_ALERTS, type AlertDirection } from "@/lib/alerts/price-alerts";

export const metadata = { title: "Alerts", robots: { index: false } };
export const dynamic = "force-dynamic";

const when = (d: Date) => d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

export default async function Page() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  const [alerts, watch] = await Promise.all([
    prisma.priceAlert.findMany({ where: { userId }, orderBy: [{ createdAt: "desc" }], take: 300 }),
    prisma.watchlistItem.findMany({ where: { userId }, select: { instrument: { select: { symbol: true } } }, take: 50 }),
  ]);
  const active = alerts.filter((a) => a.status === "ACTIVE");
  const finished = alerts.filter((a) => a.status !== "ACTIVE");
  const suggestions = [...new Set([...watch.map((w) => w.instrument.symbol), "RELIANCE.NS", "HDFCBANK.NS", "TCS.NS", "^NSEI", "BTC-INR"])];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Alerts"
        icon={Siren}
        description="Get told when an instrument reaches a price. Stocks are checked every minute while the market is open, crypto around the clock. You get a notification and, if you haven't switched it off, an email. An alert fires once."
      />
      <section className="surface p-5">
        <p className="mb-3 text-sm font-semibold text-brand-navy">Set a price alert</p>
        <AlertForm suggestions={suggestions} />
        <p className="mt-3 text-xs text-brand-navy/50">An alert is a message, not an order: nothing is bought or sold. You can keep {MAX_ACTIVE_ALERTS} active alerts.</p>
      </section>

      <section className="surface min-w-0 overflow-hidden">
        <p className="border-b border-black/[0.05] px-5 py-3.5 text-sm font-semibold text-brand-navy">Active alerts ({active.length})</p>
        {active.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-brand-navy/50">No active alerts. Set one above.</p>
        ) : (
          <ul className="divide-y divide-black/[0.05]">
            <AutoPager as="list">
              {active.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                  <span>
                    <span className="font-semibold text-brand-navy">{describeAlert({ symbol: a.symbol, direction: a.direction as AlertDirection, price: a.price })}</span>
                    {a.note && <span className="ml-2 text-xs text-brand-navy/50">{a.note}</span>}
                    <span className="block text-[11px] text-brand-navy/40">Set {when(a.createdAt)}</span>
                  </span>
                  <AlertRowActions id={a.id} active />
                </li>
              ))}
            </AutoPager>
          </ul>
        )}
      </section>

      {finished.length > 0 && (
        <section className="surface min-w-0 overflow-hidden">
          <p className="border-b border-black/[0.05] px-5 py-3.5 text-sm font-semibold text-brand-navy">Fired and cancelled</p>
          <ul className="divide-y divide-black/[0.05]">
            <AutoPager as="list">
              {finished.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                  <span>
                    <span className="font-semibold text-brand-navy">{describeAlert({ symbol: a.symbol, direction: a.direction as AlertDirection, price: a.price })}</span>
                    <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${a.status === "TRIGGERED" ? "bg-brand-buy/10 text-[#0b6b30]" : "bg-brand-navy/[0.06] text-brand-navy/55"}`}>{a.status === "TRIGGERED" ? "fired" : "cancelled"}</span>
                    <span className="block text-[11px] text-brand-navy/40">
                      {a.status === "TRIGGERED" && a.triggeredAt ? `Fired ${when(a.triggeredAt)} at ₹${(a.triggeredPrice ?? a.price).toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : `Set ${when(a.createdAt)}`}
                    </span>
                  </span>
                  <AlertRowActions id={a.id} active={false} />
                </li>
              ))}
            </AutoPager>
          </ul>
        </section>
      )}
    </div>
  );
}
