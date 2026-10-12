import { Coins } from "lucide-react";
import { auth } from "@/lib/auth";
import PageHeader from "@/components/ui/page-header";
import UsagePanel, { type BillingView } from "@/components/credits/usage-panel";
import { eventsPage } from "@/lib/credits/service";
import { pageWindow, readPageQuery } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";
import { razorpayKeys, razorpayMode } from "@/lib/billing/razorpay";
import { RAZORPAY_PLAN_ENV } from "@/lib/billing/brand";

export const metadata = { title: "Credits & usage", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function UsagePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  const sp = await searchParams;
  const keys = razorpayKeys();
  const enabled = !!keys && !!process.env[RAZORPAY_PLAN_ENV.TRADE] && !!process.env[RAZORPAY_PLAN_ENV.PRO];
  const [sub, pays] = await Promise.all([
    prisma.subscription.findFirst({ where: { userId, status: { in: ["active", "authenticated"] } }, orderBy: { createdAt: "desc" } }).catch(() => null),
    prisma.payment.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 5 }).catch(() => []),
  ]);
  const day = (d: Date | null) => (d ? d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" }) : null);
  const billing: BillingView = {
    enabled,
    testMode: keys ? razorpayMode(keys.keyId) === "test" : false,
    subscription: sub ? { plan: sub.plan, endsOn: day(sub.currentEnd), cancelAtPeriodEnd: sub.cancelAtPeriodEnd } : null,
    payments: pays.map((p) => ({ id: p.id, when: p.createdAt.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }), what: p.description ?? (p.kind === "topup" ? "Credit top-up" : "Plan payment"), amount: p.amount, status: p.status, invoice: p.invoiceNumber })),
  };
  const q = readPageQuery({ page: sp.hp, size: sp.hs }, 10);
  const first = await eventsPage(userId, 0, 1);
  const win = pageWindow(first.total, q.page, q.size);
  const { rows: events } = await eventsPage(userId, win.skip, win.take);
  return (
    <div>
      <PageHeader title="Plan, credits & billing" icon={Coins} description="What you have left, what each action costs, your plan and payments, and a record of every change. The number in the top bar is always current." />
      <UsagePanel events={events} historyWindow={win} billing={billing} />
    </div>
  );
}
